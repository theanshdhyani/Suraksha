import type { IntegrationHealthState, IntegrationStatusItem, ServiceMode } from '../core/types';

export type IntegrationKey =
  | 'elevenlabs_scribe'
  | 'elevenlabs_tts'
  | 'amazon_bedrock'
  | 'aws_cognito'
  | 'agentcore_gateway'
  | 'amazon_sns'
  | 'dynamodb'
  | 's3_object_lock'
  | 'threat_intel';

export interface IntegrationDescriptor {
  id: IntegrationKey;
  name: string;
  category: IntegrationStatusItem['category'];
  modeEnvVar?: string;
  requiredEnv: string[];
  supportsLive: boolean;
}

export const INTEGRATION_DESCRIPTORS: IntegrationDescriptor[] = [
  {
    id: 'elevenlabs_scribe',
    name: 'ElevenLabs Scribe v2 (Real-time STT)',
    category: 'AUDIO',
    modeEnvVar: 'SURAKSHA_STT_MODE',
    requiredEnv: ['ELEVENLABS_API_KEY'],
    supportsLive: true,
  },
  {
    id: 'elevenlabs_tts',
    name: 'ElevenLabs TTS (Consented Family Voice)',
    category: 'AUDIO',
    modeEnvVar: 'SURAKSHA_TTS_MODE',
    requiredEnv: ['ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID'],
    supportsLive: true,
  },
  {
    id: 'amazon_bedrock',
    name: 'Amazon Bedrock (Explanation Only)',
    category: 'AI',
    modeEnvVar: 'SURAKSHA_LLM_MODE',
    requiredEnv: ['AWS_REGION', 'BEDROCK_MODEL_ID'],
    supportsLive: true,
  },
  {
    id: 'aws_cognito',
    name: 'AWS Cognito (OAuth Principal)',
    category: 'SECURITY',
    modeEnvVar: 'SURAKSHA_GATEWAY_MODE',
    requiredEnv: ['AWS_REGION', 'COGNITO_USER_POOL_ID', 'COGNITO_CLIENT_ID'],
    supportsLive: true,
  },
  {
    id: 'agentcore_gateway',
    name: 'AWS Bedrock AgentCore Gateway',
    category: 'MCP',
    modeEnvVar: 'SURAKSHA_GATEWAY_MODE',
    requiredEnv: ['AWS_REGION', 'AGENTCORE_GATEWAY_URL'],
    supportsLive: true,
  },
  {
    id: 'amazon_sns',
    name: 'Amazon SNS (Guardian Alerts)',
    category: 'NOTIFICATION',
    modeEnvVar: 'SURAKSHA_SNS_MODE',
    requiredEnv: ['AWS_REGION', 'SNS_TOPIC_ARN'],
    supportsLive: true,
  },
  {
    id: 'dynamodb',
    name: 'Amazon DynamoDB (Hash-Chained Audit)',
    category: 'STORAGE',
    modeEnvVar: 'SURAKSHA_AUDIT_MODE',
    requiredEnv: ['AWS_REGION', 'DYNAMODB_TABLE_NAME'],
    supportsLive: true,
  },
  {
    id: 's3_object_lock',
    name: 'Amazon S3 Object Lock (Immutable Evidence)',
    category: 'STORAGE',
    modeEnvVar: 'SURAKSHA_AUDIT_MODE',
    requiredEnv: ['AWS_REGION', 'S3_AUDIT_BUCKET'],
    supportsLive: true,
  },
  {
    id: 'threat_intel',
    name: 'Threat Intelligence & URL Reputation',
    category: 'SECURITY',
    modeEnvVar: 'SURAKSHA_THREAT_INTEL_MODE',
    requiredEnv: ['THREAT_INTEL_API_URL', 'THREAT_INTEL_API_KEY'],
    supportsLive: true,
  },
];

export class ProviderConfigRegistry {
  private runtimeOverrides = new Map<IntegrationKey, ServiceMode>();

  public getConfiguredMode(desc: IntegrationDescriptor): ServiceMode {
    const override = this.runtimeOverrides.get(desc.id);
    if (override) return override;

    if (desc.modeEnvVar) {
      const envMode = process.env[desc.modeEnvVar]?.trim().toUpperCase();
      if (envMode === 'LIVE' || envMode === 'MOCK') {
        return envMode;
      }
    }

    // Auto-select LIVE only when all required environment variables are populated
    const allPresent = desc.requiredEnv.every((k) => Boolean(process.env[k]?.trim()));
    return allPresent ? 'LIVE' : 'MOCK';
  }

  public setModeOverride(id: IntegrationKey, mode: ServiceMode): void {
    this.runtimeOverrides.set(id, mode);
  }

  public evaluateEnvPresence(requiredEnv: string[]): {
    configuredEnv: string[];
    missingEnv: string[];
  } {
    const configuredEnv: string[] = [];
    const missingEnv: string[] = [];
    for (const key of requiredEnv) {
      if (process.env[key]?.trim()) {
        configuredEnv.push(key);
      } else {
        missingEnv.push(key);
      }
    }
    return { configuredEnv, missingEnv };
  }

  public getStatusSummary(
    id: IntegrationKey,
    liveProbeError?: string
  ): IntegrationStatusItem {
    const desc = INTEGRATION_DESCRIPTORS.find((d) => d.id === id)!;
    const mode = this.getConfiguredMode(desc);
    const { configuredEnv, missingEnv } = this.evaluateEnvPresence(desc.requiredEnv);

    let status: IntegrationHealthState = 'MOCK';
    let detail = '';

    if (mode === 'MOCK') {
      if (missingEnv.length > 0 && (id === 'aws_cognito' || id === 'agentcore_gateway' || id === 's3_object_lock')) {
        status = 'PENDING CONFIGURATION';
        detail = `Running local policy/storage adapter. Live AWS resource awaits: ${missingEnv.join(', ')}.`;
      } else {
        status = 'MOCK';
        detail = `Operating in independent DEMO/MOCK adapter mode without external credentials.`;
      }
    } else {
      // Requested LIVE mode
      if (missingEnv.length > 0) {
        status = 'PENDING CONFIGURATION';
        detail = `LIVE mode requested, missing configuration: ${missingEnv.join(', ')}.`;
      } else if (liveProbeError) {
        status = 'CONNECTION FAILED';
        detail = `LIVE connection probe failed: ${liveProbeError}`;
      } else {
        status = 'LIVE';
        detail = `Configured for LIVE execution (${configuredEnv.join(', ')} present).`;
      }
    }

    return {
      id: desc.id,
      name: desc.name,
      category: desc.category,
      configured_mode: mode,
      status,
      required_env: desc.requiredEnv,
      configured_env: configuredEnv,
      missing_env: missingEnv,
      last_checked_at: new Date().toISOString(),
      detail,
      supports_live: desc.supportsLive,
    };
  }
}
