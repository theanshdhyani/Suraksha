import crypto from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { GuardianNotification, ScamAlert } from '../core/types';
import type { ProviderRegistry } from '../providers/factory';

export interface FamilyMcpContext {
  providers: ProviderRegistry;
  getAlert: (alertId: string) => ScamAlert | undefined;
  recordNotification: (alertId: string, notification: GuardianNotification) => void;
}

/**
 * MCP SERVER 3: FAMILY MCP — TIER 2
 * Must ONLY be reachable behind AgentCore Gateway + Lambda Interceptor + Cedar Policy.
 */
export function createFamilyMcpServer(ctx: FamilyMcpContext): McpServer {
  const server = new McpServer({
    name: 'suraksha-family-mcp',
    version: '1.0.0',
  });

  server.registerTool(
    'alert_guardians',
    {
      title: 'Alert Family Guardians (Tier 2 - Approval Required)',
      description:
        'Notify registered family guardians via SNS with scam incident context after explicit parental "haan" approval.',
      inputSchema: {
        alert_id: z.string().min(1),
        guardian_name: z.string().min(1).default('Ansh'),
        summary: z.string().min(1),
        hindi_guidance: z.string().optional(),
      },
    },
    async ({ alert_id, guardian_name, summary, hindi_guidance }) => {
      const alert = ctx.getAlert(alert_id);
      if (!alert) {
        return {
          isError: true,
          content: [
            { type: 'text', text: JSON.stringify({ error: `Alert "${alert_id}" not found.` }) },
          ],
        };
      }

      const sns = ctx.providers.getNotificationProvider();
      const subject = `SURAKSHA URGENT: Scam Call Risk (${alert.evaluation.score}/100) on Parent Device`;
      const messageBody = [
        `Alert ID: ${alert_id}`,
        `Caller: ${alert.caller_label}`,
        `Categories: ${alert.evaluation.categories_detected.join(', ')}`,
        `Summary: ${summary}`,
        hindi_guidance ? `Guidance (Hindi): ${hindi_guidance}` : '',
        'Parent approved involving family ("haan"). Call or join immediately.',
      ]
        .filter(Boolean)
        .join('\n');

      const delivery = await sns.sendGuardianAlert({
        alert_id,
        guardian_name,
        subject,
        message: messageBody,
      });

      const notification: GuardianNotification = {
        notification_id: `ntf_${crypto.randomUUID().slice(0, 12)}`,
        alert_id,
        guardian_name,
        channel: 'SNS_PUSH',
        provider: delivery.provider,
        mode: delivery.mode,
        subject,
        message: messageBody,
        delivery_status: delivery.delivery_status,
        sent_at: new Date().toISOString(),
      };

      ctx.recordNotification(alert_id, notification);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              tier: 'TIER_2',
              server: 'family-mcp',
              notification,
            }),
          },
        ],
      };
    }
  );

  server.registerTool(
    'send_family_voice_message',
    {
      title: 'Send Family Voice Message (Tier 2 - Approval Required)',
      description:
        'Send a consented family reassurance voice clip or guardian voice note notification.',
      inputSchema: {
        alert_id: z.string().min(1),
        guardian_name: z.string().min(1).default('Ansh'),
        message_text: z.string().min(1),
      },
    },
    async ({ alert_id, guardian_name, message_text }) => {
      const tts = ctx.providers.getTtsProvider();
      const synth = await tts.synthesizeFamilyPrompt(message_text);

      const notification: GuardianNotification = {
        notification_id: `ntf_${crypto.randomUUID().slice(0, 12)}`,
        alert_id,
        guardian_name,
        channel: 'VOICE_CLIP',
        provider: synth.provider,
        mode: synth.mode,
        subject: 'Consented Family Voice Reassurance Triggered',
        message: message_text,
        delivery_status: synth.mode === 'LIVE' ? 'DELIVERED' : 'SIMULATED_DELIVERED',
        sent_at: new Date().toISOString(),
      };

      ctx.recordNotification(alert_id, notification);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              tier: 'TIER_2',
              server: 'family-mcp',
              voice_result: synth,
              notification,
            }),
          },
        ],
      };
    }
  );

  return server;
}
