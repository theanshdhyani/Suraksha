import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { HashChainedAuditLog } from '../core/auditChain';
import type { AuditEvent } from '../core/types';
import type { ProviderRegistry } from '../providers/factory';

export interface AuditMcpContext {
  auditLog: HashChainedAuditLog;
  providers: ProviderRegistry;
}

/**
 * MCP SERVER 4: AUDIT MCP
 * Strictly append-only. Exposes NO edit or delete tools.
 */
export function createAuditMcpServer(ctx: AuditMcpContext): McpServer {
  const server = new McpServer({
    name: 'suraksha-audit-mcp',
    version: '1.0.0',
  });

  server.registerTool(
    'append_event',
    {
      title: 'Append Hash-Chained Audit Event',
      description:
        'Append an immutable SHA-256 hash-chained audit record. Historical records cannot be edited or deleted.',
      inputSchema: {
        alert_id: z.string().min(1),
        session_id: z.string().min(1),
        event_type: z.enum([
          'DETECTION',
          'INTERRUPTION',
          'APPROVAL_GRANTED',
          'APPROVAL_REJECTED',
          'AUTHZ_ALLOW',
          'AUTHZ_DENY',
          'TOOL_EXECUTION',
          'NOTIFICATION',
          'EVIDENCE_GENERATED',
          'SYSTEM_ERROR',
        ]),
        actor: z.string().min(1),
        action: z.string().min(1),
        outcome: z.enum(['SUCCESS', 'DENIED', 'FAILED', 'INFO']),
        details: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async (args) => {
      const event: AuditEvent = ctx.auditLog.append({
        alert_id: args.alert_id,
        session_id: args.session_id,
        event_type: args.event_type,
        actor: args.actor,
        action: args.action,
        outcome: args.outcome,
        details: args.details ?? {},
      });

      const storageProvider = ctx.providers.getAuditStorageProvider();
      await storageProvider.mirrorAuditEvent?.(event as unknown as Record<string, unknown>);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              tier: 'AUDIT',
              server: 'audit-mcp',
              appended_event: event,
            }),
          },
        ],
      };
    }
  );

  return server;
}
