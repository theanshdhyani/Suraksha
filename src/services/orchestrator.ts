import crypto from 'node:crypto';
import path from 'node:path';
import { ApprovalService, isExplicitAffirmativeHaan } from '../core/approvalService';
import { HashChainedAuditLog } from '../core/auditChain';
import { DeterministicRuleEngine } from '../core/ruleEngine';
import { PREDEFINED_SCENARIOS } from '../core/scenarios';
import type {
  AlertLifecycleState,
  ApprovalToken,
  CallSession,
  EvidencePack,
  GuardianNotification,
  ScamAlert,
  ScamPlaybookMatch,
  TranscriptSegment,
} from '../core/types';
import { createAuditMcpServer } from '../mcp/auditMcp';
import { createFamilyMcpServer } from '../mcp/familyMcp';
import { AgentCoreGatewayRouter, type GatewayInvokeResponse } from '../mcp/gatewayRouter';
import { createListenMcpServer } from '../mcp/listenMcp';
import { createScamIntelMcpServer } from '../mcp/scamIntelMcp';
import { ProviderRegistry } from '../providers/factory';
import type { TextToSpeechResult } from '../providers/interfaces';
import { FAMILY_INTERRUPTION_PROMPT as DEFAULT_PROMPT } from '../providers/tts';

export interface OrchestratorOptions {
  auditPersistPath?: string | null;
}

export class SurakshaOrchestrator {
  public readonly providers = new ProviderRegistry();
  public readonly ruleEngine = new DeterministicRuleEngine();
  public readonly approvalService = new ApprovalService();
  public readonly auditLog: HashChainedAuditLog;
  public readonly gateway: AgentCoreGatewayRouter;

  private readonly sessions = new Map<string, CallSession>();
  private readonly alerts = new Map<string, ScamAlert>();
  private readonly evidencePacks = new Map<string, EvidencePack>();
  private readonly issuedTokens = new Map<string, ApprovalToken>();

  constructor(options: OrchestratorOptions = {}) {
    const persistPath =
      options.auditPersistPath === undefined
        ? path.resolve(process.cwd(), 'data/audit-log.json')
        : options.auditPersistPath;

    this.auditLog = new HashChainedAuditLog(persistPath);

    const listenMcp = createListenMcpServer({
      getSession: (id) => this.sessions.get(id),
    });

    const scamIntelMcp = createScamIntelMcpServer({
      providers: this.providers,
      getAlert: (id) => this.alerts.get(id),
      getSession: (id) => this.sessions.get(id),
      getAuditEventsForAlert: (id) => this.auditLog.getByAlert(id),
      getLatestAuditHash: () => this.auditLog.verifyIntegrity().latest_hash,
      saveEvidencePack: (pack) => {
        this.evidencePacks.set(pack.alert_id, pack);
      },
    });

    const familyMcp = createFamilyMcpServer({
      providers: this.providers,
      getAlert: (id) => this.alerts.get(id),
      recordNotification: (alertId, notification) => {
        const alert = this.alerts.get(alertId);
        if (alert) {
          alert.notifications.push(notification);
          alert.updated_at = new Date().toISOString();
        }
      },
    });

    const auditMcp = createAuditMcpServer({
      auditLog: this.auditLog,
      providers: this.providers,
    });

    this.gateway = new AgentCoreGatewayRouter(
      {
        listen_mcp: listenMcp,
        scam_intel_mcp: scamIntelMcp,
        family_mcp: familyMcp,
        audit_mcp: auditMcp,
      },
      this.approvalService
    );
  }

  public startSession(params: {
    scenario_id?: string;
    caller_label?: string;
    caller_number?: string;
    parent_name?: string;
    guardian_name?: string;
  }): CallSession {
    const scenario =
      PREDEFINED_SCENARIOS.find((s) => s.id === params.scenario_id) ?? PREDEFINED_SCENARIOS[0];
    const session_id = `ses_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const session: CallSession = {
      session_id,
      scenario_id: scenario.id,
      scenario_title: scenario.title,
      caller_label: params.caller_label || scenario.caller_label,
      caller_number: params.caller_number || scenario.caller_number,
      parent_name: params.parent_name || 'Maa / Papa',
      guardian_name: params.guardian_name || 'Ansh',
      status: 'ACTIVE',
      started_at: new Date().toISOString(),
      echo_suppression_active: false,
      transcript: [],
    };
    this.sessions.set(session_id, session);
    return { ...session };
  }

  public setEchoSuppression(sessionId: string, active: boolean): CallSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    session.echo_suppression_active = active;
    return { ...session };
  }

  public async ingestTranscriptSegment(params: {
    session_id: string;
    speaker: 'CALLER' | 'PARENT';
    text: string;
    language?: 'hi' | 'en' | 'hinglish';
    timestamp_ms?: number;
    is_partial?: boolean;
  }): Promise<{
    session: CallSession;
    evaluation: ReturnType<DeterministicRuleEngine['evaluateWindow']>;
    alert?: ScamAlert;
    active_alert?: ScamAlert;
    tts_interruption?: TextToSpeechResult;
    echo_suppressed: boolean;
  }> {
    const session = this.sessions.get(params.session_id);
    if (!session) {
      throw new Error(`Session "${params.session_id}" not found.`);
    }

    const nowMs = params.timestamp_ms ?? Date.now();
    const isSystemEcho =
      session.echo_suppression_active &&
      params.speaker === 'CALLER' &&
      params.text.toLowerCase().includes('ansh ko abhi bula');

    const segment: TranscriptSegment = {
      id: `seg_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
      session_id: session.session_id,
      speaker: isSystemEcho ? 'SYSTEM_SUPPRESSED' : params.speaker,
      text: params.text,
      language: params.language ?? 'hinglish',
      timestamp_ms: nowMs,
      iso_time: new Date(nowMs).toISOString(),
      is_partial: Boolean(params.is_partial),
      suppressed_echo: isSystemEcho,
    };

    session.transcript.push(segment);

    // Evaluate Deterministic Rule Engine synchronously (zero Bedrock dependency!)
    const evaluation = this.ruleEngine.evaluateWindow(session.session_id, session.transcript, nowMs);

    let createdAlert: ScamAlert | undefined;
    let ttsResult: TextToSpeechResult | undefined;

    if (evaluation.high_risk_triggered && !session.active_alert_id) {
      const alertId = `alt_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const nowIso = new Date().toISOString();

      this.approvalService.registerActiveAlert(alertId);
      session.active_alert_id = alertId;
      session.status = 'INTERRUPTED';

      const alert: ScamAlert = {
        alert_id: alertId,
        session_id: session.session_id,
        caller_label: session.caller_label,
        caller_number: session.caller_number,
        created_at: nowIso,
        updated_at: nowIso,
        lifecycle_state: 'DETECTED',
        evaluation,
        explanation: null,
        interruption_prompt: DEFAULT_PROMPT,
        approval_status: 'PENDING',
        playbook: null,
        notifications: [],
        denied_attempts: [],
        timeline: [
          {
            timestamp: nowIso,
            state: 'DETECTED',
            summary: `Deterministic Rule Engine triggered (${evaluation.score}/100, ${evaluation.categories_detected.join(', ')}).`,
          },
        ],
      };

      this.alerts.set(alertId, alert);

      // Step A: Audit DETECTION via Audit MCP behind AgentCore Gateway
      await this.gateway.invokeTool({
        server: 'audit_mcp',
        tool: 'append_event',
        arguments: {
          alert_id: alertId,
          session_id: session.session_id,
          event_type: 'DETECTION',
          actor: 'rule-engine',
          action: 'deterministic_window_detection',
          outcome: 'SUCCESS',
          details: {
            rule_version: evaluation.rule_version,
            score: evaluation.score,
            risk_level: evaluation.risk_level,
            categories: evaluation.categories_detected,
            matched_rules: evaluation.matches.map((m) => m.rule_id),
          },
        },
        caller_type: 'ORCHESTRATOR',
        origin: 'ORCHESTRATOR_LAMBDA',
        principal_id: 'role/SurakshaOrchestratorLambda',
        alert_id: alertId,
        session_id: session.session_id,
      });

      // Step B: Tier 1 Listen MCP + Scam-Intel MCP via Gateway (no parental approval needed)
      await this.gateway.invokeTool({
        server: 'listen_mcp',
        tool: 'get_transcript_window',
        arguments: { session_id: session.session_id, alert_id: alertId, window_ms: 18000 },
        caller_type: 'ORCHESTRATOR',
        origin: 'ORCHESTRATOR_LAMBDA',
        principal_id: 'role/SurakshaOrchestratorLambda',
        alert_id: alertId,
        session_id: session.session_id,
      });

      const playbookResp = await this.gateway.invokeTool({
        server: 'scam_intel_mcp',
        tool: 'match_scam_playbook',
        arguments: {
          categories: evaluation.categories_detected,
          matched_phrases: evaluation.matches.map((m) => m.matched_phrase),
        },
        caller_type: 'ORCHESTRATOR',
        origin: 'ORCHESTRATOR_LAMBDA',
        principal_id: 'role/SurakshaOrchestratorLambda',
        alert_id: alertId,
        session_id: session.session_id,
      });

      if (
        playbookResp.authorized &&
        playbookResp.tool_output &&
        typeof playbookResp.tool_output === 'object' &&
        'playbook' in playbookResp.tool_output
      ) {
        alert.playbook = (playbookResp.tool_output as { playbook: ScamPlaybookMatch | null })
          .playbook;
      }

      // Step C: Trigger immediate consented family voice interruption (BEFORE/INDEPENDENT OF Bedrock!)
      session.echo_suppression_active = true;
      const tts = this.providers.getTtsProvider();
      ttsResult = await tts.synthesizeFamilyPrompt(DEFAULT_PROMPT);

      const interruptTime = new Date().toISOString();
      alert.interruption_played_at = interruptTime;
      alert.echo_suppressed = true;
      this.transitionAlert(
        alert,
        'INTERRUPTION_PLAYED',
        `Played consented family voice prompt: "${DEFAULT_PROMPT}" (echo suppression enabled).`
      );
      this.transitionAlert(
        alert,
        'APPROVAL_PENDING',
        'Waiting for parent explicit "haan" confirmation before Tier 2 family escalation.'
      );

      await this.gateway.invokeTool({
        server: 'audit_mcp',
        tool: 'append_event',
        arguments: {
          alert_id: alertId,
          session_id: session.session_id,
          event_type: 'INTERRUPTION',
          actor: 'elevenlabs-tts-adapter',
          action: 'play_consented_family_prompt',
          outcome: 'SUCCESS',
          details: {
            prompt: DEFAULT_PROMPT,
            voice_id: ttsResult.voice_id,
            consent_record_id: ttsResult.consent_record_id,
            echo_suppression_active: true,
          },
        },
        caller_type: 'ORCHESTRATOR',
        origin: 'ORCHESTRATOR_LAMBDA',
        principal_id: 'role/SurakshaOrchestratorLambda',
        alert_id: alertId,
        session_id: session.session_id,
      });

      // Step D: Obtain Bedrock/MockLLM family explanation independently (never blocks interruption or authorizes tools)
      try {
        const llm = this.providers.getLlmProvider();
        alert.explanation = await llm.explainRiskForFamily({
          evaluation,
          transcript: session.transcript,
          guardianName: session.guardian_name,
        });
      } catch {
        alert.explanation = null;
      }

      createdAlert = { ...alert };
    } else if (session.active_alert_id) {
      // Keep active alert's evaluation & playbook updated with newest segments
      const existing = this.alerts.get(session.active_alert_id);
      if (existing) {
        existing.evaluation = evaluation;
        existing.updated_at = new Date().toISOString();
        const pbResp = await this.gateway.invokeTool({
          server: 'scam_intel_mcp',
          tool: 'match_scam_playbook',
          arguments: {
            categories: evaluation.categories_detected,
            matched_phrases: evaluation.matches.map((m) => m.matched_phrase),
          },
          caller_type: 'ORCHESTRATOR',
          origin: 'ORCHESTRATOR_LAMBDA',
          principal_id: 'role/SurakshaOrchestratorLambda',
          alert_id: existing.alert_id,
          session_id: session.session_id,
        });
        if (
          pbResp.authorized &&
          pbResp.tool_output &&
          typeof pbResp.tool_output === 'object' &&
          'playbook' in pbResp.tool_output
        ) {
          existing.playbook = (pbResp.tool_output as { playbook: ScamPlaybookMatch | null })
            .playbook;
        }
      }
    }

    const activeAlert = session.active_alert_id
      ? this.alerts.get(session.active_alert_id)
      : undefined;

    return {
      session: { ...session, transcript: [...session.transcript] },
      evaluation,
      alert: createdAlert,
      active_alert: activeAlert ? { ...activeAlert } : undefined,
      tts_interruption: ttsResult,
      echo_suppressed: isSystemEcho,
    };
  }

  public async submitParentalResponse(params: {
    alert_id: string;
    utterance: string;
    approver_id?: string;
  }): Promise<{
    approved: boolean;
    alert: ScamAlert;
    token?: ApprovalToken;
    gateway_result?: GatewayInvokeResponse;
    evidence_pack?: EvidencePack;
    error?: string;
  }> {
    const alert = this.alerts.get(params.alert_id);
    if (!alert) {
      throw new Error(`Alert "${params.alert_id}" not found.`);
    }
    const session = this.sessions.get(alert.session_id);
    if (!session) {
      throw new Error(`Session "${alert.session_id}" not found.`);
    }

    if (alert.approval_status === 'APPROVED') {
      return {
        approved: false,
        alert: { ...alert },
        error: `Alert "${alert.alert_id}" has already been approved and guardian notification was already dispatched.`,
      };
    }

    // Resume transcript monitoring after interruption response
    session.echo_suppression_active = false;

    // Record parent utterance in transcript
    session.transcript.push({
      id: `seg_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
      session_id: session.session_id,
      speaker: 'PARENT',
      text: params.utterance,
      language: 'hinglish',
      timestamp_ms: Date.now(),
      iso_time: new Date().toISOString(),
      is_partial: false,
    });

    if (!isExplicitAffirmativeHaan(params.utterance)) {
      alert.approval_status = 'REJECTED';
      this.transitionAlert(
        alert,
        'REJECTED',
        `Parent did not grant explicit "haan" approval (utterance: "${params.utterance}"). Tier 2 family tools remained locked.`
      );

      await this.gateway.invokeTool({
        server: 'audit_mcp',
        tool: 'append_event',
        arguments: {
          alert_id: alert.alert_id,
          session_id: session.session_id,
          event_type: 'APPROVAL_REJECTED',
          actor: params.approver_id || 'parent-primary',
          action: 'parent_declined_or_ambiguous',
          outcome: 'INFO',
          details: { utterance: params.utterance },
        },
        caller_type: 'ORCHESTRATOR',
        origin: 'ORCHESTRATOR_LAMBDA',
        principal_id: 'role/SurakshaOrchestratorLambda',
        alert_id: alert.alert_id,
        session_id: session.session_id,
      });

      return {
        approved: false,
        alert: { ...alert },
        error: `Utterance "${params.utterance}" is not an explicit "haan" approval. Family alerts were NOT sent.`,
      };
    }

    // 1. Issue signed single-use approval token bound strictly to this alert_id
    const token = this.approvalService.issueApprovalToken({
      alert_id: alert.alert_id,
      approver_id: params.approver_id || 'parent-primary',
      utterance: params.utterance,
    });
    this.issuedTokens.set(alert.alert_id, token);

    alert.approval_status = 'APPROVED';
    alert.approval_token_id = token.token_id;
    alert.approved_at = token.issued_at;
    this.transitionAlert(
      alert,
      'APPROVED',
      `Parent explicitly approved ("${params.utterance}"). Signed single-use token ${token.token_id} issued.`
    );

    await this.gateway.invokeTool({
      server: 'audit_mcp',
      tool: 'append_event',
      arguments: {
        alert_id: alert.alert_id,
        session_id: session.session_id,
        event_type: 'APPROVAL_GRANTED',
        actor: token.approver_id,
        action: 'issue_single_use_approval_token',
        outcome: 'SUCCESS',
        details: {
          token_id: token.token_id,
          expires_at: token.expires_at,
          permitted_actions: token.permitted_actions,
        },
      },
      caller_type: 'ORCHESTRATOR',
      origin: 'ORCHESTRATOR_LAMBDA',
      principal_id: 'role/SurakshaOrchestratorLambda',
      alert_id: alert.alert_id,
      session_id: session.session_id,
    });

    // 2. Authorization Check & Tier 2 Execution via AgentCore Gateway
    this.transitionAlert(
      alert,
      'AUTHORIZATION_CHECK',
      'Submitting signed token through AgentCore Gateway -> Lambda Interceptor -> Cedar Policy.'
    );

    const familyGatewayResult = await this.gateway.invokeTool({
      server: 'family_mcp',
      tool: 'alert_guardians',
      arguments: {
        alert_id: alert.alert_id,
        guardian_name: session.guardian_name,
        summary:
          alert.explanation?.family_risk_summary || alert.evaluation.verdict_summary,
        hindi_guidance: alert.explanation?.hindi_explanation || '',
      },
      caller_type: 'ORCHESTRATOR',
      origin: 'ORCHESTRATOR_LAMBDA',
      principal_id: 'role/SurakshaOrchestratorLambda',
      alert_id: alert.alert_id,
      session_id: session.session_id,
      approval_token: token,
      consume_token: true,
    });

    if (!familyGatewayResult.authorized || familyGatewayResult.status !== 'ALLOWED') {
      this.transitionAlert(
        alert,
        familyGatewayResult.status === 'DENIED' ? 'DENIED' : 'FAILED',
        familyGatewayResult.error || 'Gateway authorization failed.'
      );
      return {
        approved: true,
        alert: { ...alert },
        token,
        gateway_result: familyGatewayResult,
        error: familyGatewayResult.error,
      };
    }

    this.transitionAlert(
      alert,
      'TOOL_EXECUTION',
      `Lambda Interceptor & Cedar Policy (${familyGatewayResult.cedar_decision.matched_policy_id}) permitted family_mcp:alert_guardians.`
    );
    this.transitionAlert(
      alert,
      'FAMILY_ALERTED',
      `Guardian "${session.guardian_name}" notified (${alert.notifications[alert.notifications.length - 1]?.delivery_status || 'DELIVERED'}).`
    );

    await this.gateway.invokeTool({
      server: 'audit_mcp',
      tool: 'append_event',
      arguments: {
        alert_id: alert.alert_id,
        session_id: session.session_id,
        event_type: 'NOTIFICATION',
        actor: 'family-mcp',
        action: 'sns_guardian_notification',
        outcome: 'SUCCESS',
        details: {
          guardian: session.guardian_name,
          notification_count: alert.notifications.length,
        },
      },
      caller_type: 'ORCHESTRATOR',
      origin: 'ORCHESTRATOR_LAMBDA',
      principal_id: 'role/SurakshaOrchestratorLambda',
      alert_id: alert.alert_id,
      session_id: session.session_id,
    });

    // 3. Prepare Tamper-Evident Evidence Pack via Scam-Intel MCP (Tier 1)
    const evidenceResp = await this.gateway.invokeTool({
      server: 'scam_intel_mcp',
      tool: 'prepare_evidence_pack',
      arguments: { alert_id: alert.alert_id },
      caller_type: 'ORCHESTRATOR',
      origin: 'ORCHESTRATOR_LAMBDA',
      principal_id: 'role/SurakshaOrchestratorLambda',
      alert_id: alert.alert_id,
      session_id: session.session_id,
    });

    const pack =
      evidenceResp.authorized &&
      evidenceResp.tool_output &&
      typeof evidenceResp.tool_output === 'object' &&
      'evidence_pack' in evidenceResp.tool_output
        ? (evidenceResp.tool_output as { evidence_pack: EvidencePack }).evidence_pack
        : this.evidencePacks.get(alert.alert_id);

    if (pack) {
      alert.evidence_id = pack.evidence_id;
      this.transitionAlert(
        alert,
        'EVIDENCE_READY',
        `Evidence Pack ${pack.evidence_id} compiled. EVIDENCE READY – MANUAL FAMILY SUBMISSION REQUIRED.`
      );

      await this.gateway.invokeTool({
        server: 'audit_mcp',
        tool: 'append_event',
        arguments: {
          alert_id: alert.alert_id,
          session_id: session.session_id,
          event_type: 'EVIDENCE_GENERATED',
          actor: 'scam-intel-mcp',
          action: 'prepare_evidence_pack',
          outcome: 'SUCCESS',
          details: {
            evidence_id: pack.evidence_id,
            integrity_hash: pack.audit_integrity_hash,
          },
        },
        caller_type: 'ORCHESTRATOR',
        origin: 'ORCHESTRATOR_LAMBDA',
        principal_id: 'role/SurakshaOrchestratorLambda',
        alert_id: alert.alert_id,
        session_id: session.session_id,
      });
    }

    session.status = 'COMPLETED';
    session.ended_at = new Date().toISOString();

    return {
      approved: true,
      alert: { ...alert },
      token: this.approvalService.getTokenRecord(token.token_id) || token,
      gateway_result: familyGatewayResult,
      evidence_pack: pack,
    };
  }

  /**
   * Demonstrates real policy enforcement by attempting an unauthorized Tier 2 or forbidden
   * call through AgentCore Gateway (e.g., missing token, reused token, LLM override, or alert mismatch).
   */
  public async testUnauthorizedGatewayCall(params: {
    alert_id: string;
    scenario: 'MISSING_TOKEN' | 'REUSED_TOKEN' | 'LLM_OVERRIDE' | 'WRONG_ALERT_ID' | 'FORBIDDEN_SCAMMER_REPLY';
  }): Promise<GatewayInvokeResponse> {
    const alert = this.alerts.get(params.alert_id);
    const sessionId = alert?.session_id || 'demo-session';
    let result: GatewayInvokeResponse;

    if (params.scenario === 'FORBIDDEN_SCAMMER_REPLY') {
      result = await this.gateway.invokeTool({
        server: 'family_mcp',
        tool: 'reply_to_scammer',
        arguments: { alert_id: params.alert_id },
        caller_type: 'LLM',
        origin: 'LLM',
        principal_id: 'agent/BedrockExplainAgent',
        alert_id: params.alert_id,
        session_id: sessionId,
        approval_token: null,
      });
    } else if (params.scenario === 'LLM_OVERRIDE') {
      result = await this.gateway.invokeTool({
        server: 'family_mcp',
        tool: 'alert_guardians',
        arguments: {
          alert_id: params.alert_id,
          guardian_name: 'Ansh',
          summary: 'Attempted LLM override without human approval',
        },
        caller_type: 'LLM',
        origin: 'LLM',
        principal_id: 'agent/BedrockExplainAgent',
        alert_id: params.alert_id,
        session_id: sessionId,
        approval_token: null,
        llm_override_attempted: true,
      });
    } else if (params.scenario === 'REUSED_TOKEN') {
      const existingToken = this.issuedTokens.get(params.alert_id) || null;
      result = await this.gateway.invokeTool({
        server: 'family_mcp',
        tool: 'alert_guardians',
        arguments: {
          alert_id: params.alert_id,
          guardian_name: 'Ansh',
          summary: 'Attempted replay of already-used single-use token',
        },
        caller_type: 'ORCHESTRATOR',
        origin: 'ORCHESTRATOR_LAMBDA',
        principal_id: 'role/SurakshaOrchestratorLambda',
        alert_id: params.alert_id,
        session_id: sessionId,
        approval_token: existingToken,
      });
    } else if (params.scenario === 'WRONG_ALERT_ID') {
      const existingToken = this.issuedTokens.get(params.alert_id) || null;
      result = await this.gateway.invokeTool({
        server: 'family_mcp',
        tool: 'alert_guardians',
        arguments: {
          alert_id: 'alt_mismatched_9999',
          guardian_name: 'Ansh',
          summary: 'Attempted cross-alert token use',
        },
        caller_type: 'ORCHESTRATOR',
        origin: 'ORCHESTRATOR_LAMBDA',
        principal_id: 'role/SurakshaOrchestratorLambda',
        alert_id: 'alt_mismatched_9999',
        session_id: sessionId,
        approval_token: existingToken,
      });
    } else {
      // MISSING_TOKEN
      result = await this.gateway.invokeTool({
        server: 'family_mcp',
        tool: 'alert_guardians',
        arguments: {
          alert_id: params.alert_id,
          guardian_name: 'Ansh',
          summary: 'Attempted Family MCP call without parental approval token',
        },
        caller_type: 'FRONTEND_DIRECT',
        origin: 'USER_UI',
        principal_id: 'user/unauthenticated-ui',
        alert_id: params.alert_id,
        session_id: sessionId,
        approval_token: null,
      });
    }

    if (alert && result.status === 'DENIED') {
      alert.denied_attempts.push({
        timestamp: new Date().toISOString(),
        action: params.scenario,
        reason: result.error || result.cedar_decision.reason,
        code: result.interceptor_validation?.code || result.cedar_decision.effect,
        policy_id: result.cedar_decision.matched_policy_id,
      });
      alert.updated_at = new Date().toISOString();
    }

    return result;
  }

  public getSession(sessionId: string): CallSession | undefined {
    const s = this.sessions.get(sessionId);
    return s ? { ...s, transcript: [...s.transcript] } : undefined;
  }

  public listSessions(): CallSession[] {
    return Array.from(this.sessions.values()).reverse();
  }

  public getAlert(alertId: string): ScamAlert | undefined {
    const a = this.alerts.get(alertId);
    return a ? { ...a } : undefined;
  }

  public listAlerts(): ScamAlert[] {
    return Array.from(this.alerts.values()).sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
  }

  public getEvidencePack(alertId: string): EvidencePack | undefined {
    return this.evidencePacks.get(alertId);
  }

  public listEvidencePacks(): EvidencePack[] {
    return Array.from(this.evidencePacks.values()).sort((a, b) =>
      b.generated_at.localeCompare(a.generated_at)
    );
  }

  public getDashboardSummary() {
    const alerts = this.listAlerts();
    const highRiskAlerts = alerts.filter(
      (a) => a.evaluation.risk_level === 'HIGH' || a.evaluation.risk_level === 'CRITICAL'
    );
    const sessions = this.listSessions();
    const auditVerification = this.auditLog.verifyIntegrity();

    return {
      protection_active: true,
      parent_device_connected: true,
      guardian_connected: true,
      guardian_name: 'Ansh',
      total_sessions: sessions.length,
      total_alerts: alerts.length,
      high_risk_incidents: highRiskAlerts.length,
      evidence_packs_ready: this.evidencePacks.size,
      audit_chain_valid: auditVerification.valid,
      audit_total_events: auditVerification.total_events,
      recent_alerts: alerts.slice(0, 5),
      recent_audit: this.auditLog.list(8).reverse(),
    };
  }

  private transitionAlert(alert: ScamAlert, state: AlertLifecycleState, summary: string): void {
    const ts = new Date().toISOString();
    alert.lifecycle_state = state;
    alert.updated_at = ts;
    alert.timeline.push({ timestamp: ts, state, summary });
  }
}
