export type ScamCategory =
  | 'ISOLATION'
  | 'FAKE_AUTHORITY'
  | 'THREATS'
  | 'URGENCY'
  | 'MONEY_CREDENTIALS'
  | 'REMOTE_ACCESS';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type AlertLifecycleState =
  | 'MONITORING'
  | 'DETECTED'
  | 'INTERRUPTION_PLAYED'
  | 'APPROVAL_PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'AUTHORIZATION_CHECK'
  | 'TOOL_EXECUTION'
  | 'FAMILY_ALERTED'
  | 'EVIDENCE_READY'
  | 'DENIED'
  | 'FAILED';

export type IntegrationHealthState =
  | 'MOCK'
  | 'LIVE'
  | 'PENDING CONFIGURATION'
  | 'CONNECTION FAILED';

export type ServiceMode = 'MOCK' | 'LIVE';

export interface TranscriptSegment {
  id: string;
  session_id: string;
  speaker: 'CALLER' | 'PARENT' | 'SYSTEM_SUPPRESSED';
  text: string;
  language: 'hi' | 'en' | 'hinglish';
  timestamp_ms: number;
  iso_time: string;
  is_partial: boolean;
  suppressed_echo?: boolean;
}

export interface RuleMatch {
  rule_id: string;
  category: ScamCategory;
  label: string;
  weight: number;
  matched_phrase: string;
  segment_id: string;
  timestamp_ms: number;
}

export interface RuleEngineEvaluation {
  rule_version: string;
  window_start_ms: number;
  window_end_ms: number;
  window_duration_ms: number;
  segments_evaluated: number;
  score: number;
  threshold: number;
  risk_level: RiskLevel;
  high_risk_triggered: boolean;
  categories_detected: ScamCategory[];
  matches: RuleMatch[];
  deduplicated: boolean;
  evaluation_latency_ms: number;
  verdict_summary: string;
}

export interface LLMExplanation {
  provider: string;
  mode: ServiceMode;
  why_flagged: string;
  family_risk_summary: string;
  hindi_explanation: string;
  suggested_guardian_script: string;
  tactics_breakdown: string[];
  generated_at: string;
}

export type PermittedFamilyAction =
  | 'family_mcp:alert_guardians'
  | 'family_mcp:send_family_voice_message';

export interface ApprovalTokenPayload {
  token_id: string;
  alert_id: string;
  approver_id: string;
  permitted_actions: PermittedFamilyAction[];
  issued_at: string;
  expires_at: string;
  nonce: string;
  parent_utterance: string;
}

export interface ApprovalToken extends ApprovalTokenPayload {
  signature: string;
  usage_status: 'UNUSED' | 'USED' | 'EXPIRED' | 'REVOKED';
  used_at?: string;
}

export interface TokenValidationResult {
  valid: boolean;
  reason: string;
  code:
    | 'VALID'
    | 'MISSING_TOKEN'
    | 'INVALID_SIGNATURE'
    | 'EXPIRED'
    | 'REUSED'
    | 'ALERT_MISMATCH'
    | 'UNAUTHORIZED_SCOPE'
    | 'TAMPERED'
    | 'UNKNOWN_TOKEN';
  token_id?: string;
}

export interface CedarEvaluationContext {
  caller_type: 'ORCHESTRATOR' | 'LLM' | 'FRONTEND_DIRECT' | 'GUARDIAN';
  origin: 'ORCHESTRATOR_LAMBDA' | 'LLM' | 'USER_UI' | 'EXTERNAL';
  principal_id: string;
  action: string;
  resource: string;
  alert_id?: string;
  approval_token_valid?: boolean;
  approval_token_single_use_unused?: boolean;
  approval_alert_match?: boolean;
  approval_action_scoped?: boolean;
  parent_affirmative_utterance?: string;
  llm_override_attempted?: boolean;
}

export interface CedarDecision {
  decision: 'ALLOW' | 'DENY';
  effect: 'PERMIT' | 'FORBID' | 'DEFAULT_DENY';
  matched_policy_id: string;
  reason: string;
  evaluated_at: string;
}

export interface AuditEvent {
  seq: number;
  event_id: string;
  timestamp: string;
  alert_id: string;
  session_id: string;
  event_type:
    | 'DETECTION'
    | 'INTERRUPTION'
    | 'APPROVAL_GRANTED'
    | 'APPROVAL_REJECTED'
    | 'AUTHZ_ALLOW'
    | 'AUTHZ_DENY'
    | 'TOOL_EXECUTION'
    | 'NOTIFICATION'
    | 'EVIDENCE_GENERATED'
    | 'SYSTEM_ERROR';
  actor: string;
  action: string;
  outcome: 'SUCCESS' | 'DENIED' | 'FAILED' | 'INFO';
  details: Record<string, unknown>;
  previous_event_hash: string;
  event_hash: string;
}

export interface AuditVerificationResult {
  valid: boolean;
  total_events: number;
  broken_at_seq?: number;
  reason: string;
  checked_at: string;
  latest_hash: string;
}

export interface GuardianNotification {
  notification_id: string;
  alert_id: string;
  guardian_name: string;
  channel: 'SNS_PUSH' | 'SNS_SMS' | 'VOICE_CLIP';
  provider: string;
  mode: ServiceMode;
  subject: string;
  message: string;
  delivery_status: 'DELIVERED' | 'SIMULATED_DELIVERED' | 'FAILED';
  sent_at: string;
}

export interface URLCheckResult {
  url: string;
  normalized_host: string;
  verdict: 'SAFE' | 'SUSPICIOUS' | 'MALICIOUS';
  risk_score: number;
  indicators: string[];
  matched_dataset_entry?: string;
  checked_at: string;
  never_fetched_live: true;
}

export interface ScamPlaybookMatch {
  playbook_id: string;
  title: string;
  tactics: ScamCategory[];
  confidence: number;
  description: string;
  recommended_family_action: string;
}

export interface EvidencePack {
  evidence_id: string;
  alert_id: string;
  session_id: string;
  caller_label: string;
  caller_number: string;
  call_started_at: string;
  detected_at: string;
  generated_at: string;
  rule_version: string;
  rule_verdict: RiskLevel;
  risk_score: number;
  matched_categories: ScamCategory[];
  matched_indicators: RuleMatch[];
  matched_playbook: ScamPlaybookMatch | null;
  transcript_excerpts: TranscriptSegment[];
  risk_explanation: LLMExplanation | null;
  url_checks: URLCheckResult[];
  event_timeline: Array<{
    timestamp: string;
    event_type: string;
    actor: string;
    action: string;
    outcome: string;
  }>;
  audit_integrity_hash: string;
  submission_status: 'EVIDENCE READY – MANUAL FAMILY SUBMISSION REQUIRED';
  manual_reporting_channels: Array<{
    channel: string;
    target: string;
    instructions: string;
  }>;
}

export interface ScamAlert {
  alert_id: string;
  session_id: string;
  caller_label: string;
  caller_number: string;
  created_at: string;
  updated_at: string;
  lifecycle_state: AlertLifecycleState;
  evaluation: RuleEngineEvaluation;
  explanation: LLMExplanation | null;
  interruption_prompt: string;
  interruption_played_at?: string;
  echo_suppressed?: boolean;
  approval_status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approval_token_id?: string;
  approved_at?: string;
  playbook: ScamPlaybookMatch | null;
  notifications: GuardianNotification[];
  evidence_id?: string;
  denied_attempts: Array<{
    timestamp: string;
    action: string;
    reason: string;
    code: string;
    policy_id: string;
  }>;
  timeline: Array<{
    timestamp: string;
    state: AlertLifecycleState;
    summary: string;
  }>;
}

export interface CallSession {
  session_id: string;
  scenario_id: string;
  scenario_title: string;
  caller_label: string;
  caller_number: string;
  parent_name: string;
  guardian_name: string;
  status: 'IDLE' | 'ACTIVE' | 'INTERRUPTED' | 'COMPLETED';
  started_at: string;
  ended_at?: string;
  echo_suppression_active: boolean;
  transcript: TranscriptSegment[];
  active_alert_id?: string;
}

export interface ScenarioDefinition {
  id: string;
  title: string;
  caller_label: string;
  caller_number: string;
  language: 'hi' | 'en' | 'hinglish';
  expected_risk: RiskLevel;
  summary: string;
  segments: Array<{
    delay_ms: number;
    speaker: 'CALLER' | 'PARENT';
    text: string;
    language: 'hi' | 'en' | 'hinglish';
  }>;
}

export interface IntegrationStatusItem {
  id: string;
  name: string;
  category: 'AUDIO' | 'AI' | 'SECURITY' | 'MCP' | 'NOTIFICATION' | 'STORAGE';
  configured_mode: ServiceMode;
  status: IntegrationHealthState;
  required_env: string[];
  configured_env: string[];
  missing_env: string[];
  last_checked_at: string;
  detail: string;
  supports_live: boolean;
}
