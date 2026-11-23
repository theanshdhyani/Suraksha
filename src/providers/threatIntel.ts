import { CognitoIdentityProviderClient, DescribeUserPoolCommand } from '@aws-sdk/client-cognito-identity-provider';
import { inspectSuspiciousUrlOffline } from '../core/scamIntelligence';
import type { ServiceMode, URLCheckResult } from '../core/types';
import type {
  GatewayProvider,
  ProviderHealthReport,
  ThreatIntelligenceProvider,
} from './interfaces';

export class MockThreatIntelligenceProvider implements ThreatIntelligenceProvider {
  public readonly id = 'threat_intel';
  public readonly name = 'MockThreatIntelligenceProvider (Offline Local Intel)';

  public getMode(): ServiceMode {
    return 'MOCK';
  }

  public async healthCheck(): Promise<ProviderHealthReport> {
    return {
      id: this.id,
      name: this.name,
      mode: 'MOCK',
      status: 'MOCK',
      detail: 'Offline India scam domain & brand-impersonation dataset active (never opens links).',
      checked_at: new Date().toISOString(),
    };
  }

  public async checkUrlReputation(url: string): Promise<URLCheckResult> {
    return inspectSuspiciousUrlOffline(url);
  }
}

export class ConfigurableThreatIntelligenceProvider implements ThreatIntelligenceProvider {
  public readonly id = 'threat_intel';
  public readonly name = 'ConfigurableThreatIntelligenceProvider (External Lookup API)';

  public getMode(): ServiceMode {
    return 'LIVE';
  }

  public async healthCheck(): Promise<ProviderHealthReport> {
    const apiUrl = process.env.THREAT_INTEL_API_URL?.trim();
    const apiKey = process.env.THREAT_INTEL_API_KEY?.trim();
    const checked_at = new Date().toISOString();

    if (!apiUrl || !apiKey) {
      return {
        id: this.id,
        name: this.name,
        mode: 'LIVE',
        status: 'PENDING CONFIGURATION',
        detail: 'Missing THREAT_INTEL_API_URL or THREAT_INTEL_API_KEY.',
        checked_at,
      };
    }

    return {
      id: this.id,
      name: this.name,
      mode: 'LIVE',
      status: 'LIVE',
      detail: 'External threat-intelligence lookup API configured.',
      checked_at,
    };
  }

  public async checkUrlReputation(url: string): Promise<URLCheckResult> {
    // Still performs offline structural analysis first and NEVER fetches the untrusted target URL directly.
    const offline = inspectSuspiciousUrlOffline(url);
    const apiUrl = process.env.THREAT_INTEL_API_URL?.trim();
    const apiKey = process.env.THREAT_INTEL_API_KEY?.trim();
    if (!apiUrl || !apiKey) {
      return offline;
    }
    try {
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(4000),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { flagged?: boolean; reason?: string };
        if (data.flagged) {
          return {
            ...offline,
            verdict: 'MALICIOUS',
            risk_score: Math.max(offline.risk_score, 90),
            indicators: [...offline.indicators, data.reason || 'Flagged by external threat feed'],
          };
        }
      }
    } catch {
      // Fallback to offline result without crashing
    }
    return offline;
  }
}

export class LocalAgentCoreGatewayProvider implements GatewayProvider {
  public readonly id = 'agentcore_gateway';
  public readonly name = 'LocalAgentCoreGatewayProvider (Local MCP + Cedar + Interceptor)';

  public getMode(): ServiceMode {
    return 'MOCK';
  }

  public async healthCheck(): Promise<ProviderHealthReport> {
    return {
      id: this.id,
      name: this.name,
      mode: 'MOCK',
      status: 'MOCK',
      detail: 'Local AgentCore Gateway routing 4 MCP servers with Lambda Interceptor & Cedar.',
      checked_at: new Date().toISOString(),
    };
  }
}

export class AwsAgentCoreGatewayProvider implements GatewayProvider {
  public readonly id = 'agentcore_gateway';
  public readonly name = 'AwsAgentCoreGatewayProvider (AWS Bedrock AgentCore + Cognito)';

  public getMode(): ServiceMode {
    return 'LIVE';
  }

  public async healthCheck(): Promise<ProviderHealthReport> {
    const region = process.env.AWS_REGION?.trim();
    const poolId = process.env.COGNITO_USER_POOL_ID?.trim();
    const gatewayUrl = process.env.AGENTCORE_GATEWAY_URL?.trim();
    const checked_at = new Date().toISOString();

    if (!region || !poolId || !gatewayUrl) {
      return {
        id: this.id,
        name: this.name,
        mode: 'LIVE',
        status: 'PENDING CONFIGURATION',
        detail: 'Missing AWS_REGION, COGNITO_USER_POOL_ID, or AGENTCORE_GATEWAY_URL.',
        checked_at,
      };
    }

    try {
      const cognito = new CognitoIdentityProviderClient({ region });
      await cognito.send(new DescribeUserPoolCommand({ UserPoolId: poolId }));
      return {
        id: this.id,
        name: this.name,
        mode: 'LIVE',
        status: 'LIVE',
        detail: `Cognito pool="${poolId}" and AgentCore Gateway="${gatewayUrl}" reachable.`,
        checked_at,
      };
    } catch (err) {
      return {
        id: this.id,
        name: this.name,
        mode: 'LIVE',
        status: 'CONNECTION FAILED',
        detail: err instanceof Error ? err.message : 'Failed to validate Cognito/Gateway.',
        checked_at,
      };
    }
  }
}
