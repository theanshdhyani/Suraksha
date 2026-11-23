import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildEvidencePack } from '../core/evidencePack';
import { DeterministicRuleEngine } from '../core/ruleEngine';
import { matchScamPlaybook } from '../core/scamIntelligence';
import type {
  AuditEvent,
  CallSession,
  EvidencePack,
  ScamAlert,
  ScamCategory,
  TranscriptSegment,
  URLCheckResult,
} from '../core/types';
import type { ProviderRegistry } from '../providers/factory';

export interface ScamIntelMcpContext {
  providers: ProviderRegistry;
  getAlert: (alertId: string) => ScamAlert | undefined;
  getSession: (sessionId: string) => CallSession | undefined;
  getAuditEventsForAlert: (alertId: string) => AuditEvent[];
  getLatestAuditHash: () => string;
  saveEvidencePack: (pack: EvidencePack) => void;
}

export function createScamIntelMcpServer(ctx: ScamIntelMcpContext): McpServer {
  const server = new McpServer({
    name: 'suraksha-scam-intel-mcp',
    version: '1.0.0',
  });

  const ruleEngine = new DeterministicRuleEngine();

  server.registerTool(
    'match_scam_playbook',
    {
      title: 'Match Scam Playbook (Tier 1)',
      description: 'Match detected scam categories against known Indian scam playbooks.',
      inputSchema: {
        categories: z.array(
          z.enum([
            'ISOLATION',
            'FAKE_AUTHORITY',
            'THREATS',
            'URGENCY',
            'MONEY_CREDENTIALS',
            'REMOTE_ACCESS',
          ])
        ),
        matched_phrases: z.array(z.string()).optional(),
      },
    },
    async ({ categories, matched_phrases }) => {
      const playbook = matchScamPlaybook(categories as ScamCategory[], matched_phrases ?? []);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              tier: 'TIER_1',
              server: 'scam-intel-mcp',
              playbook,
            }),
          },
        ],
      };
    }
  );

  server.registerTool(
    'score_signals',
    {
      title: 'Score Transcript Signals (Tier 1)',
      description: 'Run deterministic rule scoring over provided transcript segments.',
      inputSchema: {
        session_id: z.string().min(1),
        segments: z.array(
          z.object({
            id: z.string(),
            speaker: z.enum(['CALLER', 'PARENT', 'SYSTEM_SUPPRESSED']),
            text: z.string(),
            language: z.enum(['hi', 'en', 'hinglish']).default('hinglish'),
            timestamp_ms: z.number(),
          })
        ),
      },
    },
    async ({ session_id, segments }) => {
      const normalized: TranscriptSegment[] = segments.map((s) => ({
        ...s,
        session_id,
        iso_time: new Date(s.timestamp_ms).toISOString(),
        is_partial: false,
      }));
      const evalResult = ruleEngine.evaluateWindow(session_id, normalized);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              tier: 'TIER_1',
              server: 'scam-intel-mcp',
              evaluation: evalResult,
            }),
          },
        ],
      };
    }
  );

  server.registerTool(
    'check_url',
    {
      title: 'Check Suspicious URL (Tier 1)',
      description:
        'Inspect URL reputation using offline intelligence / configured provider without ever opening or fetching the target URL.',
      inputSchema: {
        url: z.string().min(3),
      },
    },
    async ({ url }) => {
      const provider = ctx.providers.getThreatIntelProvider();
      const result: URLCheckResult = await provider.checkUrlReputation(url);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              tier: 'TIER_1',
              server: 'scam-intel-mcp',
              result,
            }),
          },
        ],
      };
    }
  );

  server.registerTool(
    'prepare_evidence_pack',
    {
      title: 'Prepare Evidence Pack (Tier 1)',
      description:
        'Compile structured, tamper-evident evidence pack for manual family submission to Chakshu, 1930, and cybercrime.gov.in.',
      inputSchema: {
        alert_id: z.string().min(1),
        url_checks: z.array(z.any()).optional(),
      },
    },
    async ({ alert_id, url_checks }) => {
      const alert = ctx.getAlert(alert_id);
      if (!alert) {
        return {
          isError: true,
          content: [
            { type: 'text', text: JSON.stringify({ error: `Alert "${alert_id}" not found.` }) },
          ],
        };
      }
      const session = ctx.getSession(alert.session_id);
      if (!session) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: `Session "${alert.session_id}" not found.` }),
            },
          ],
        };
      }

      const pack = buildEvidencePack({
        alert,
        session,
        auditEvents: ctx.getAuditEventsForAlert(alert_id),
        urlChecks: (url_checks as URLCheckResult[] | undefined) ?? [],
        latestAuditHash: ctx.getLatestAuditHash(),
      });

      ctx.saveEvidencePack(pack);

      const storageProvider = ctx.providers.getAuditStorageProvider();
      await storageProvider.storeEvidenceObject?.(pack.evidence_id, JSON.stringify(pack, null, 2));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              tier: 'TIER_1',
              server: 'scam-intel-mcp',
              evidence_pack: pack,
            }),
          },
        ],
      };
    }
  );

  return server;
}
