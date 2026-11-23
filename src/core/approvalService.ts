import crypto from 'node:crypto';
import type {
  ApprovalToken,
  ApprovalTokenPayload,
  PermittedFamilyAction,
  TokenValidationResult,
} from './types';

export const DEFAULT_APPROVAL_TTL_MS = 120_000; // 2 minutes single-use window

const AFFIRMATIVE_PATTERNS = [
  /^haan$/i,
  /^han$/i,
  /^haan\s+bula\s+lo$/i,
  /^haan\s+ansh\s+ko\s+bula\s+lo$/i,
  /^haan\s+ji$/i,
  /^hanji$/i,
  /^हाँ$/i,
  /^हां$/i,
  /^हाँ\s+बुला\s+लो$/i,
  /^yes\s+call\s+ansh$/i,
];

export function isExplicitAffirmativeHaan(utterance: string): boolean {
  const normalized = utterance
    .trim()
    .replace(/[.,!?"'।]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return false;
  return AFFIRMATIVE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export class ApprovalService {
  private readonly signingKey: Buffer;
  private readonly ttlMs: number;
  private readonly tokenStore = new Map<string, ApprovalToken>();
  private readonly activeAlerts = new Set<string>();

  constructor(options?: { signingSecret?: string; ttlMs?: number }) {
    const secret =
      options?.signingSecret ||
      process.env.APPROVAL_SIGNING_SECRET ||
      crypto.randomBytes(32).toString('hex');
    this.signingKey = crypto.createHash('sha256').update(secret).digest();
    this.ttlMs = options?.ttlMs ?? DEFAULT_APPROVAL_TTL_MS;
  }

  public registerActiveAlert(alertId: string): void {
    this.activeAlerts.add(alertId);
  }

  public clearActiveAlert(alertId: string): void {
    this.activeAlerts.delete(alertId);
  }

  public issueApprovalToken(params: {
    alert_id: string;
    approver_id: string;
    utterance: string;
    permitted_actions?: PermittedFamilyAction[];
    nowMs?: number;
  }): ApprovalToken {
    if (!params.alert_id || !this.activeAlerts.has(params.alert_id)) {
      throw new Error(`No active alert registered for alert_id="${params.alert_id}".`);
    }

    if (!isExplicitAffirmativeHaan(params.utterance)) {
      throw new Error(
        `Ambiguous or non-affirmative utterance "${params.utterance}" rejected. Explicit "haan" approval is required.`
      );
    }

    const now = params.nowMs ?? Date.now();
    const permittedActions: PermittedFamilyAction[] =
      params.permitted_actions && params.permitted_actions.length > 0
        ? params.permitted_actions
        : ['family_mcp:alert_guardians', 'family_mcp:send_family_voice_message'];

    const payload: ApprovalTokenPayload = {
      token_id: `tok_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
      alert_id: params.alert_id,
      approver_id: params.approver_id || 'parent-primary',
      permitted_actions: permittedActions,
      issued_at: new Date(now).toISOString(),
      expires_at: new Date(now + this.ttlMs).toISOString(),
      nonce: crypto.randomBytes(16).toString('hex'),
      parent_utterance: params.utterance.trim(),
    };

    const signature = this.signPayload(payload);
    const token: ApprovalToken = {
      ...payload,
      signature,
      usage_status: 'UNUSED',
    };

    this.tokenStore.set(token.token_id, { ...token });
    return token;
  }

  public validateAndConsumeToken(params: {
    token: ApprovalToken | null | undefined;
    expected_alert_id: string;
    requested_action: string;
    consume?: boolean;
    nowMs?: number;
  }): TokenValidationResult {
    const token = params.token;
    if (!token || !token.token_id || !token.signature) {
      return {
        valid: false,
        code: 'MISSING_TOKEN',
        reason: 'Missing parental approval token.',
      };
    }

    // Verify cryptographic signature first (catches forged or tampered signatures)
    const expectedSig = this.signPayload({
      token_id: token.token_id,
      alert_id: token.alert_id,
      approver_id: token.approver_id,
      permitted_actions: token.permitted_actions,
      issued_at: token.issued_at,
      expires_at: token.expires_at,
      nonce: token.nonce,
      parent_utterance: token.parent_utterance,
    });

    const sigBuf = Buffer.from(token.signature, 'hex');
    const expBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return {
        valid: false,
        code: 'INVALID_SIGNATURE',
        reason: 'Approval token cryptographic signature verification failed (or payload tampered).',
        token_id: token.token_id,
      };
    }

    const stored = this.tokenStore.get(token.token_id);
    if (!stored) {
      return {
        valid: false,
        code: 'UNKNOWN_TOKEN',
        reason: 'Approval token was not issued by this Approval Service instance.',
        token_id: token.token_id,
      };
    }

    // Check payload tampering against server-side issued record
    if (
      stored.alert_id !== token.alert_id ||
      stored.nonce !== token.nonce ||
      stored.expires_at !== token.expires_at ||
      stored.permitted_actions.join(',') !== token.permitted_actions.join(',')
    ) {
      return {
        valid: false,
        code: 'TAMPERED',
        reason: 'Approval token payload differs from server-issued record.',
        token_id: token.token_id,
      };
    }

    if (stored.usage_status === 'USED') {
      return {
        valid: false,
        code: 'REUSED',
        reason: 'Approval token has already been used. Replay blocked.',
        token_id: token.token_id,
      };
    }

    const now = params.nowMs ?? Date.now();
    const expiresMs = Date.parse(stored.expires_at);
    if (Number.isNaN(expiresMs) || now > expiresMs) {
      stored.usage_status = 'EXPIRED';
      return {
        valid: false,
        code: 'EXPIRED',
        reason: `Approval token expired at ${stored.expires_at}.`,
        token_id: token.token_id,
      };
    }

    if (stored.alert_id !== params.expected_alert_id) {
      return {
        valid: false,
        code: 'ALERT_MISMATCH',
        reason: `Approval token is bound to alert "${stored.alert_id}", not "${params.expected_alert_id}".`,
        token_id: token.token_id,
      };
    }

    if (!stored.permitted_actions.includes(params.requested_action as PermittedFamilyAction)) {
      return {
        valid: false,
        code: 'UNAUTHORIZED_SCOPE',
        reason: `Approval token does not grant scope for "${params.requested_action}".`,
        token_id: token.token_id,
      };
    }

    if (params.consume !== false) {
      stored.usage_status = 'USED';
      stored.used_at = new Date(now).toISOString();
    }

    return {
      valid: true,
      code: 'VALID',
      reason: 'Cryptographic signature, alert binding, TTL, scope, and single-use checks passed.',
      token_id: token.token_id,
    };
  }

  public getTokenRecord(tokenId: string): ApprovalToken | undefined {
    const rec = this.tokenStore.get(tokenId);
    return rec ? { ...rec } : undefined;
  }

  private signPayload(payload: ApprovalTokenPayload): string {
    const canonical = JSON.stringify({
      token_id: payload.token_id,
      alert_id: payload.alert_id,
      approver_id: payload.approver_id,
      permitted_actions: [...payload.permitted_actions].sort(),
      issued_at: payload.issued_at,
      expires_at: payload.expires_at,
      nonce: payload.nonce,
      parent_utterance: payload.parent_utterance,
    });
    return crypto.createHmac('sha256', this.signingKey).update(canonical).digest('hex');
  }
}
