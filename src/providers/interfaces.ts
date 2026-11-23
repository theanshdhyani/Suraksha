import type {
  IntegrationHealthState,
  LLMExplanation,
  RuleEngineEvaluation,
  ServiceMode,
  TranscriptSegment,
  URLCheckResult,
} from '../core/types';

export interface ProviderHealthReport {
  id: string;
  name: string;
  mode: ServiceMode;
  status: IntegrationHealthState;
  detail: string;
  checked_at: string;
}

export interface SpeechToTextProvider {
  readonly id: string;
  readonly name: string;
  getMode(): ServiceMode;
  healthCheck(): Promise<ProviderHealthReport>;
  createLiveSessionConfig?(languageHint?: string): {
    wsUrl: string;
    modelId: string;
    headersPresent: boolean;
  };
}

export interface TextToSpeechResult {
  prompt_text: string;
  voice_id: string;
  consented: boolean;
  consent_record_id: string;
  provider: string;
  mode: ServiceMode;
  audio_url: string;
  browser_speech_fallback: boolean;
  generated_at: string;
}

export interface TextToSpeechProvider {
  readonly id: string;
  readonly name: string;
  getMode(): ServiceMode;
  healthCheck(): Promise<ProviderHealthReport>;
  synthesizeFamilyPrompt(promptText: string, voiceId?: string): Promise<TextToSpeechResult>;
}

export interface LLMProvider {
  readonly id: string;
  readonly name: string;
  getMode(): ServiceMode;
  healthCheck(): Promise<ProviderHealthReport>;
  explainRiskForFamily(input: {
    evaluation: RuleEngineEvaluation;
    transcript: TranscriptSegment[];
    guardianName: string;
  }): Promise<LLMExplanation>;
}

export interface NotificationProvider {
  readonly id: string;
  readonly name: string;
  getMode(): ServiceMode;
  healthCheck(): Promise<ProviderHealthReport>;
  sendGuardianAlert(input: {
    alert_id: string;
    guardian_name: string;
    subject: string;
    message: string;
  }): Promise<{
    provider: string;
    mode: ServiceMode;
    delivery_status: 'DELIVERED' | 'SIMULATED_DELIVERED' | 'FAILED';
    external_message_id: string;
  }>;
}

export interface GatewayProvider {
  readonly id: string;
  readonly name: string;
  getMode(): ServiceMode;
  healthCheck(): Promise<ProviderHealthReport>;
}

export interface AuditStorageProvider {
  readonly id: string;
  readonly name: string;
  getMode(): ServiceMode;
  healthCheck(): Promise<ProviderHealthReport>;
  mirrorAuditEvent?(event: Record<string, unknown>): Promise<{ mirrored: boolean; target: string }>;
  storeEvidenceObject?(evidenceId: string, bodyJson: string): Promise<{ stored: boolean; target: string }>;
}

export interface ThreatIntelligenceProvider {
  readonly id: string;
  readonly name: string;
  getMode(): ServiceMode;
  healthCheck(): Promise<ProviderHealthReport>;
  checkUrlReputation(url: string): Promise<URLCheckResult>;
}
