import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CallSession } from '../core/types';

export interface ListenMcpContext {
  getSession: (sessionId: string) => CallSession | undefined;
}

export function createListenMcpServer(ctx: ListenMcpContext): McpServer {
  const server = new McpServer({
    name: 'suraksha-listen-mcp',
    version: '1.0.0',
  });

  server.registerTool(
    'get_transcript_window',
    {
      title: 'Get Transcript Window (Tier 1)',
      description:
        'Retrieve timestamped transcript excerpts within a rolling window for an alert or call session. Read-only Tier 1 tool.',
      inputSchema: {
        session_id: z.string().min(1),
        alert_id: z.string().optional(),
        window_ms: z.number().int().min(1000).max(120000).default(18000),
      },
    },
    async ({ session_id, alert_id, window_ms }) => {
      const session = ctx.getSession(session_id);
      if (!session) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: `Session "${session_id}" not found.` }),
            },
          ],
        };
      }

      const activeSegments = session.transcript.filter((s) => !s.suppressed_echo);
      const latestTs =
        activeSegments.length > 0
          ? Math.max(...activeSegments.map((s) => s.timestamp_ms))
          : Date.now();
      const cutoff = latestTs - window_ms;
      const excerpts = activeSegments.filter((s) => s.timestamp_ms >= cutoff);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              tier: 'TIER_1',
              server: 'listen-mcp',
              session_id,
              alert_id: alert_id ?? session.active_alert_id ?? null,
              window_ms,
              window_start_iso: new Date(cutoff).toISOString(),
              window_end_iso: new Date(latestTs).toISOString(),
              segment_count: excerpts.length,
              excerpts: excerpts.map((e) => ({
                id: e.id,
                speaker: e.speaker,
                text: e.text,
                language: e.language,
                iso_time: e.iso_time,
                timestamp_ms: e.timestamp_ms,
              })),
            }),
          },
        ],
      };
    }
  );

  return server;
}
