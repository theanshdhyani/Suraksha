import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AuditEvent, AuditVerificationResult } from './types';

export const GENESIS_HASH =
  '0000000000000000000000000000000000000000000000000000000000000000';

export function computeEventHash(eventWithoutHash: Omit<AuditEvent, 'event_hash'>): string {
  const canonical = JSON.stringify({
    seq: eventWithoutHash.seq,
    event_id: eventWithoutHash.event_id,
    timestamp: eventWithoutHash.timestamp,
    alert_id: eventWithoutHash.alert_id,
    session_id: eventWithoutHash.session_id,
    event_type: eventWithoutHash.event_type,
    actor: eventWithoutHash.actor,
    action: eventWithoutHash.action,
    outcome: eventWithoutHash.outcome,
    details: eventWithoutHash.details,
    previous_event_hash: eventWithoutHash.previous_event_hash,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export class HashChainedAuditLog {
  private events: AuditEvent[] = [];
  private readonly persistPath: string | null;

  constructor(persistPath?: string | null) {
    this.persistPath = persistPath === undefined ? null : persistPath;
    if (this.persistPath) {
      this.loadFromDisk();
    }
  }

  public append(input: {
    alert_id: string;
    session_id: string;
    event_type: AuditEvent['event_type'];
    actor: string;
    action: string;
    outcome: AuditEvent['outcome'];
    details?: Record<string, unknown>;
    timestamp?: string;
  }): AuditEvent {
    const seq = this.events.length + 1;
    const previous_event_hash =
      this.events.length === 0
        ? GENESIS_HASH
        : this.events[this.events.length - 1].event_hash;

    const base: Omit<AuditEvent, 'event_hash'> = {
      seq,
      event_id: `evt_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`,
      timestamp: input.timestamp ?? new Date().toISOString(),
      alert_id: input.alert_id,
      session_id: input.session_id,
      event_type: input.event_type,
      actor: input.actor,
      action: input.action,
      outcome: input.outcome,
      details: input.details ?? {},
      previous_event_hash,
    };

    const event: AuditEvent = {
      ...base,
      event_hash: computeEventHash(base),
    };

    this.events.push(event);
    this.saveToDisk();
    return { ...event };
  }

  public list(limit?: number): AuditEvent[] {
    const copy = this.events.map((e) => ({ ...e, details: { ...e.details } }));
    if (limit && limit > 0) {
      return copy.slice(-limit);
    }
    return copy;
  }

  public getByAlert(alertId: string): AuditEvent[] {
    return this.events
      .filter((e) => e.alert_id === alertId)
      .map((e) => ({ ...e, details: { ...e.details } }));
  }

  public verifyIntegrity(): AuditVerificationResult {
    const checkedAt = new Date().toISOString();
    if (this.events.length === 0) {
      return {
        valid: true,
        total_events: 0,
        reason: 'Audit chain initialized at genesis block (0 events).',
        checked_at: checkedAt,
        latest_hash: GENESIS_HASH,
      };
    }

    let expectedPrev = GENESIS_HASH;
    for (let i = 0; i < this.events.length; i++) {
      const ev = this.events[i];
      if (ev.seq !== i + 1) {
        return {
          valid: false,
          total_events: this.events.length,
          broken_at_seq: ev.seq,
          reason: `Sequence gap or reordering detected at index ${i} (found seq=${ev.seq}).`,
          checked_at: checkedAt,
          latest_hash: this.events[this.events.length - 1].event_hash,
        };
      }

      if (ev.previous_event_hash !== expectedPrev) {
        return {
          valid: false,
          total_events: this.events.length,
          broken_at_seq: ev.seq,
          reason: `Broken previous_event_hash link at seq=${ev.seq}. Historical event was modified or removed.`,
          checked_at: checkedAt,
          latest_hash: this.events[this.events.length - 1].event_hash,
        };
      }

      const { event_hash, ...rest } = ev;
      const recomputed = computeEventHash(rest);
      if (recomputed !== event_hash) {
        return {
          valid: false,
          total_events: this.events.length,
          broken_at_seq: ev.seq,
          reason: `SHA-256 hash mismatch at seq=${ev.seq}. Record payload was tampered.`,
          checked_at: checkedAt,
          latest_hash: this.events[this.events.length - 1].event_hash,
        };
      }

      expectedPrev = ev.event_hash;
    }

    return {
      valid: true,
      total_events: this.events.length,
      reason: `All ${this.events.length} audit events verified cleanly against SHA-256 hash chain.`,
      checked_at: checkedAt,
      latest_hash: expectedPrev,
    };
  }

  /**
   * Used ONLY for unit tests or explicit tamper-detection demonstrations
   * when verifying that historical modification is caught.
   */
  public _unsafeSimulateTamperForVerificationTest(seq: number, newAction: string): void {
    const idx = this.events.findIndex((e) => e.seq === seq);
    if (idx !== -1) {
      this.events[idx].action = newAction;
    }
  }

  private loadFromDisk(): void {
    if (!this.persistPath) return;
    try {
      if (fs.existsSync(this.persistPath)) {
        const raw = fs.readFileSync(this.persistPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.events = parsed;
        }
      }
    } catch {
      this.events = [];
    }
  }

  private saveToDisk(): void {
    if (!this.persistPath) return;
    try {
      const dir = path.dirname(this.persistPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.persistPath, JSON.stringify(this.events, null, 2), 'utf-8');
    } catch {
      // Ignore write failures in read-only environments
    }
  }
}
