import type {
  AuditEvent,
  AuditVerificationResult,
  CallSession,
  EvidencePack,
  IntegrationStatusItem,
  RuleEngineEvaluation,
  ScamAlert,
  ScenarioDefinition,
  ServiceMode,
} from '../core/types';
import type { GatewayInvokeResponse, RegisteredToolInfo } from '../mcp/gatewayRouter';
import type { TextToSpeechResult } from '../providers/interfaces';
import type { DrillScenario } from '../services/scamDrillService';

export interface DashboardSummary {
  protection_active: boolean;
  parent_device_connected: boolean;
  guardian_connected: boolean;
  guardian_name: string;
  total_sessions: number;
  total_alerts: number;
  high_risk_incidents: number;
  evidence_packs_ready: number;
  audit_chain_valid: boolean;
  audit_total_events: number;
  recent_alerts: ScamAlert[];
  recent_audit: AuditEvent[];
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const data = await resp.json();
  if (!resp.ok && resp.status !== 403) {
    throw new Error(data?.error || `Request failed (${resp.status})`);
  }
  return data as T;
}

export const api = {
  getDashboard: () => requestJson<DashboardSummary>('/api/dashboard'),
  getScenarios: () => requestJson<{ scenarios: ScenarioDefinition[] }>('/api/scenarios'),
  startSession: (payload: {
    scenario_id: string;
    parent_name?: string;
    guardian_name?: string;
  }) => requestJson<{ session: CallSession }>('/api/sessions', { method: 'POST', body: JSON.stringify(payload) }),
  setEchoSuppression: (sessionId: string, active: boolean) =>
    requestJson<{ session: CallSession }>(`/api/sessions/${sessionId}/echo-suppression`, {
      method: 'POST',
      body: JSON.stringify({ active }),
    }),
  ingestTranscript: (
    sessionId: string,
    payload: {
      speaker: 'CALLER' | 'PARENT';
      text: string;
      language?: 'hi' | 'en' | 'hinglish';
      timestamp_ms?: number;
    }
  ) =>
    requestJson<{
      session: CallSession;
      evaluation: RuleEngineEvaluation;
      alert?: ScamAlert;
      active_alert?: ScamAlert;
      tts_interruption?: TextToSpeechResult;
      echo_suppressed: boolean;
    }>(`/api/sessions/${sessionId}/transcript`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getAlerts: () => requestJson<{ alerts: ScamAlert[] }>('/api/alerts'),
  submitApproval: (alertId: string, utterance: string) =>
    requestJson<{
      approved: boolean;
      alert: ScamAlert;
      token?: Record<string, unknown>;
      gateway_result?: GatewayInvokeResponse;
      evidence_pack?: EvidencePack;
      error?: string;
    }>(`/api/alerts/${alertId}/approval`, {
      method: 'POST',
      body: JSON.stringify({ utterance }),
    }),
  testUnauthorizedGateway: (
    alertId: string,
    scenario:
      | 'MISSING_TOKEN'
      | 'REUSED_TOKEN'
      | 'LLM_OVERRIDE'
      | 'WRONG_ALERT_ID'
      | 'FORBIDDEN_SCAMMER_REPLY'
  ) =>
    requestJson<GatewayInvokeResponse>('/api/gateway/test-unauthorized', {
      method: 'POST',
      body: JSON.stringify({ alert_id: alertId, scenario }),
    }),
  getGatewayTools: () =>
    requestJson<{ tools: RegisteredToolInfo[]; cedar_policy: string }>('/api/gateway/tools'),
  getEvidencePacks: () => requestJson<{ evidence_packs: EvidencePack[] }>('/api/evidence'),
  getAudit: () =>
    requestJson<{ events: AuditEvent[]; verification: AuditVerificationResult }>('/api/audit'),
  verifyAudit: () => requestJson<AuditVerificationResult>('/api/audit/verify'),
  getIntegrations: (probe = false) =>
    requestJson<{ integrations: IntegrationStatusItem[] }>(
      `/api/integrations${probe ? '?probe=true' : ''}`
    ),
  setIntegrationMode: (id: string, mode: ServiceMode) =>
    requestJson<{ integrations: IntegrationStatusItem[] }>(`/api/integrations/${id}/mode`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),
  getDrillScenarios: () =>
    requestJson<{ isolated_from_live_call: boolean; scenarios: DrillScenario[] }>(
      '/api/drill/scenarios'
    ),
  checkSuspiciousMessage: (payload: { messageText?: string; url?: string }) =>
    requestJson<{
      isolated_module: string;
      never_opened_links: boolean;
      message_analysis?: {
        score: number;
        risk_level: string;
        categories: string[];
        matched_phrases: string[];
        explanation: string;
      };
      url_checks: Array<{
        url: string;
        normalized_host: string;
        verdict: string;
        risk_score: number;
        indicators: string[];
        never_fetched_live: boolean;
      }>;
    }>('/api/drill/check-message', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
