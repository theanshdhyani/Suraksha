import { AwsDynamoS3AuditProvider, LocalAuditStorageProvider } from './auditStorage';
import { INTEGRATION_DESCRIPTORS, type IntegrationKey, ProviderConfigRegistry } from './config';
import type {
  AuditStorageProvider,
  GatewayProvider,
  LLMProvider,
  NotificationProvider,
  ProviderHealthReport,
  SpeechToTextProvider,
  TextToSpeechProvider,
  ThreatIntelligenceProvider,
} from './interfaces';
import { AmazonBedrockProvider, MockLLMProvider } from './llm';
import { AmazonSNSProvider, MockNotificationProvider } from './notifications';
import { ElevenLabsScribeProvider, MockSpeechToTextProvider } from './stt';
import {
  AwsAgentCoreGatewayProvider,
  ConfigurableThreatIntelligenceProvider,
  LocalAgentCoreGatewayProvider,
  MockThreatIntelligenceProvider,
} from './threatIntel';
import { ElevenLabsTTSProvider, MockTTSProvider } from './tts';
import type { IntegrationStatusItem, ServiceMode } from '../core/types';

export class ProviderRegistry {
  public readonly configRegistry = new ProviderConfigRegistry();
  private lastHealthReports = new Map<string, ProviderHealthReport>();

  public getSttProvider(): SpeechToTextProvider {
    const desc = INTEGRATION_DESCRIPTORS.find((d) => d.id === 'elevenlabs_scribe')!;
    return this.configRegistry.getConfiguredMode(desc) === 'LIVE'
      ? new ElevenLabsScribeProvider()
      : new MockSpeechToTextProvider();
  }

  public getTtsProvider(): TextToSpeechProvider {
    const desc = INTEGRATION_DESCRIPTORS.find((d) => d.id === 'elevenlabs_tts')!;
    return this.configRegistry.getConfiguredMode(desc) === 'LIVE'
      ? new ElevenLabsTTSProvider()
      : new MockTTSProvider();
  }

  public getLlmProvider(): LLMProvider {
    const desc = INTEGRATION_DESCRIPTORS.find((d) => d.id === 'amazon_bedrock')!;
    return this.configRegistry.getConfiguredMode(desc) === 'LIVE'
      ? new AmazonBedrockProvider()
      : new MockLLMProvider();
  }

  public getNotificationProvider(): NotificationProvider {
    const desc = INTEGRATION_DESCRIPTORS.find((d) => d.id === 'amazon_sns')!;
    return this.configRegistry.getConfiguredMode(desc) === 'LIVE'
      ? new AmazonSNSProvider()
      : new MockNotificationProvider();
  }

  public getAuditStorageProvider(): AuditStorageProvider {
    const desc = INTEGRATION_DESCRIPTORS.find((d) => d.id === 'dynamodb')!;
    return this.configRegistry.getConfiguredMode(desc) === 'LIVE'
      ? new AwsDynamoS3AuditProvider()
      : new LocalAuditStorageProvider();
  }

  public getGatewayProvider(): GatewayProvider {
    const desc = INTEGRATION_DESCRIPTORS.find((d) => d.id === 'agentcore_gateway')!;
    return this.configRegistry.getConfiguredMode(desc) === 'LIVE'
      ? new AwsAgentCoreGatewayProvider()
      : new LocalAgentCoreGatewayProvider();
  }

  public getThreatIntelProvider(): ThreatIntelligenceProvider {
    const desc = INTEGRATION_DESCRIPTORS.find((d) => d.id === 'threat_intel')!;
    return this.configRegistry.getConfiguredMode(desc) === 'LIVE'
      ? new ConfigurableThreatIntelligenceProvider()
      : new MockThreatIntelligenceProvider();
  }

  public setServiceMode(id: IntegrationKey, mode: ServiceMode): void {
    this.configRegistry.setModeOverride(id, mode);
  }

  public async runAllHealthChecks(): Promise<IntegrationStatusItem[]> {
    const reports = await Promise.all([
      this.getSttProvider().healthCheck(),
      this.getTtsProvider().healthCheck(),
      this.getLlmProvider().healthCheck(),
      this.getNotificationProvider().healthCheck(),
      this.getAuditStorageProvider().healthCheck(),
      this.getGatewayProvider().healthCheck(),
      this.getThreatIntelProvider().healthCheck(),
    ]);

    for (const r of reports) {
      this.lastHealthReports.set(r.id, r);
    }

    const gatewayReport = this.lastHealthReports.get('agentcore_gateway');
    if (gatewayReport) {
      this.lastHealthReports.set('aws_cognito', {
        ...gatewayReport,
        id: 'aws_cognito',
        name: 'AWS Cognito (OAuth Principal)',
      });
    }

    const auditReport = this.lastHealthReports.get('dynamodb');
    if (auditReport) {
      this.lastHealthReports.set('s3_object_lock', {
        ...auditReport,
        id: 's3_object_lock',
        name: 'Amazon S3 Object Lock (Immutable Evidence)',
      });
    }

    return this.getIntegrationStatuses();
  }

  public getIntegrationStatuses(): IntegrationStatusItem[] {
    return INTEGRATION_DESCRIPTORS.map((desc) => {
      const report = this.lastHealthReports.get(desc.id);
      const base = this.configRegistry.getStatusSummary(desc.id);
      if (!report) return base;

      // Preserve truthful probe status when live health check was run
      if (base.configured_mode === 'LIVE') {
        if (base.missing_env.length > 0) {
          return base;
        }
        return {
          ...base,
          status: report.status,
          detail: report.detail,
          last_checked_at: report.checked_at,
        };
      }
      return base;
    });
  }
}
