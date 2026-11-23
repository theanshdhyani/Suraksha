import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApprovalService } from '../core/approvalService';
import { CedarPolicyEngine } from '../core/cedarPolicy';
import type {
  ApprovalToken,
  CedarDecision,
  CedarEvaluationContext,
  TokenValidationResult,
} from '../core/types';

export type McpServerId = 'listen_mcp' | 'scam_intel_mcp' | 'family_mcp' | 'audit_mcp';

export interface GatewayInvokeRequest {
  server: McpServerId;
  tool: string;
  arguments: Record<string, unknown>;
  caller_type: CedarEvaluationContext['caller_type'];
  origin: CedarEvaluationContext['origin'];
  principal_id: string;
  alert_id?: string;
  session_id?: string;
  approval_token?: ApprovalToken | null;
  llm_override_attempted?: boolean;
  consume_token?: boolean;
}

export interface GatewayInvokeResponse {
  authorized: boolean;
  status: 'ALLOWED' | 'DENIED' | 'FAILED';
  interceptor_validation?: TokenValidationResult;
  cedar_decision: CedarDecision;
  tool_output?: unknown;
  error?: string;
}

export interface RegisteredToolInfo {
  server: McpServerId;
  tier: 'TIER_1' | 'TIER_2' | 'AUDIT';
  name: string;
  description?: string;
}

/**
 * AgentCore Gateway Router + Lambda Interceptor + Cedar Policy Enforcement.
 * Every MCP tool call must traverse this Gateway; Tier 2 Family MCP is strictly
 * isolated behind token + Interceptor + Cedar checks and never exposed directly.
 */
export class AgentCoreGatewayRouter {
  private readonly clients = new Map<McpServerId, Client>();
  private readonly cedar = new CedarPolicyEngine();
  private initialized = false;

  constructor(
    private readonly servers: Record<McpServerId, McpServer>,
    private readonly approvalService: ApprovalService
  ) {}

  public async init(): Promise<void> {
    if (this.initialized) return;

    const entries = Object.entries(this.servers) as Array<[McpServerId, McpServer]>;
    for (const [id, mcpServer] of entries) {
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({
        name: `agentcore-gateway-client-${id}`,
        version: '1.0.0',
      });
      await mcpServer.connect(serverTransport);
      await client.connect(clientTransport);
      this.clients.set(id, client);
    }

    this.initialized = true;
  }

  public async listRegisteredTools(): Promise<RegisteredToolInfo[]> {
    await this.init();
    const out: RegisteredToolInfo[] = [];
    for (const [serverId, client] of this.clients.entries()) {
      const listed = await client.listTools();
      const tier: RegisteredToolInfo['tier'] =
        serverId === 'family_mcp'
          ? 'TIER_2'
          : serverId === 'audit_mcp'
          ? 'AUDIT'
          : 'TIER_1';
      for (const tool of listed.tools) {
        out.push({
          server: serverId,
          tier,
          name: tool.name,
          description: tool.description,
        });
      }
    }
    return out;
  }

  public async invokeTool(req: GatewayInvokeRequest): Promise<GatewayInvokeResponse> {
    await this.init();

    const actionName = `${req.server}:${req.tool}`;
    const isTier2 = req.server === 'family_mcp';
    const alertId = req.alert_id || String(req.arguments.alert_id || 'none');
    const sessionId = req.session_id || 'unknown-session';

    let interceptorResult: TokenValidationResult | undefined;
    let cedarContext: CedarEvaluationContext = {
      caller_type: req.caller_type,
      origin: req.origin,
      principal_id: req.principal_id,
      action: actionName,
      resource: 'suraksha-agentcore-gateway',
      alert_id: alertId,
      llm_override_attempted: req.llm_override_attempted,
    };

    // Step 1: Lambda Interceptor (mandatory for Tier 2, or whenever token is provided)
    if (isTier2) {
      interceptorResult = this.approvalService.validateAndConsumeToken({
        token: req.approval_token,
        expected_alert_id: alertId,
        requested_action: actionName,
        consume: false, // Validate first; consume right after Cedar allows so invalid Cedar requests don't burn tokens
      });

      cedarContext = {
        ...cedarContext,
        approval_token_valid: interceptorResult.valid,
        approval_token_single_use_unused: interceptorResult.code !== 'REUSED' && interceptorResult.valid,
        approval_alert_match: interceptorResult.code !== 'ALERT_MISMATCH' && interceptorResult.valid,
        approval_action_scoped:
          interceptorResult.code !== 'UNAUTHORIZED_SCOPE' && interceptorResult.valid,
        parent_affirmative_utterance: req.approval_token?.parent_utterance,
      };
    }

    // Step 2: Cedar Policy Evaluation (Default-Deny, Forbid-Wins, Outside LLM)
    const cedarDecision = this.cedar.evaluate(cedarContext);

    if (
      (isTier2 && (!interceptorResult || !interceptorResult.valid)) ||
      cedarDecision.decision !== 'ALLOW'
    ) {
      const denyReason =
        interceptorResult && !interceptorResult.valid
          ? `${interceptorResult.reason} [${cedarDecision.matched_policy_id}]`
          : cedarDecision.reason;

      // Record AUTHZ_DENY in Audit MCP (never invokes Family MCP!)
      if (actionName !== 'audit_mcp:append_event') {
        await this.appendAuditInternal({
          alert_id: alertId,
          session_id: sessionId,
          event_type: 'AUTHZ_DENY',
          actor: req.principal_id,
          action: actionName,
          outcome: 'DENIED',
          details: {
            caller_type: req.caller_type,
            origin: req.origin,
            interceptor_code: interceptorResult?.code ?? 'N/A',
            cedar_effect: cedarDecision.effect,
            matched_policy_id: cedarDecision.matched_policy_id,
            reason: denyReason,
          },
        });
      }

      return {
        authorized: false,
        status: 'DENIED',
        interceptor_validation: interceptorResult,
        cedar_decision: cedarDecision,
        error: denyReason,
      };
    }

    // Step 3: Consume single-use token atomically on Tier 2 execution
    if (isTier2 && req.consume_token !== false) {
      const consumed = this.approvalService.validateAndConsumeToken({
        token: req.approval_token,
        expected_alert_id: alertId,
        requested_action: actionName,
        consume: true,
      });
      if (!consumed.valid) {
        return {
          authorized: false,
          status: 'DENIED',
          interceptor_validation: consumed,
          cedar_decision: {
            ...cedarDecision,
            decision: 'DENY',
            effect: 'FORBID',
            reason: consumed.reason,
          },
          error: consumed.reason,
        };
      }
      interceptorResult = consumed;
    }

    // Record AUTHZ_ALLOW before invoking tool (avoid infinite recursion for audit_mcp)
    if (actionName !== 'audit_mcp:append_event') {
      await this.appendAuditInternal({
        alert_id: alertId,
        session_id: sessionId,
        event_type: 'AUTHZ_ALLOW',
        actor: req.principal_id,
        action: actionName,
        outcome: 'SUCCESS',
        details: {
          matched_policy_id: cedarDecision.matched_policy_id,
          token_id: req.approval_token?.token_id ?? null,
        },
      });
    }

    // Step 4: Execute actual MCP Server tool over InMemoryTransport
    const client = this.clients.get(req.server);
    if (!client) {
      return {
        authorized: true,
        status: 'FAILED',
        interceptor_validation: interceptorResult,
        cedar_decision: cedarDecision,
        error: `MCP server "${req.server}" is not registered.`,
      };
    }

    try {
      const mcpResult = await client.callTool({
        name: req.tool,
        arguments: req.arguments,
      });

      const contentArr = Array.isArray(mcpResult.content) ? mcpResult.content : [];
      const firstText = contentArr.find(
        (c): c is { type: 'text'; text: string } =>
          typeof c === 'object' && c !== null && c.type === 'text' && typeof c.text === 'string'
      );
      let parsed: unknown = firstText?.text ?? mcpResult;
      if (firstText?.text) {
        try {
          parsed = JSON.parse(firstText.text);
        } catch {
          parsed = firstText.text;
        }
      }

      if (mcpResult.isError) {
        return {
          authorized: true,
          status: 'FAILED',
          interceptor_validation: interceptorResult,
          cedar_decision: cedarDecision,
          tool_output: parsed,
          error: typeof parsed === 'object' && parsed && 'error' in parsed ? String((parsed as { error: string }).error) : 'MCP tool returned error.',
        };
      }

      if (actionName !== 'audit_mcp:append_event') {
        await this.appendAuditInternal({
          alert_id: alertId,
          session_id: sessionId,
          event_type: 'TOOL_EXECUTION',
          actor: req.principal_id,
          action: actionName,
          outcome: 'SUCCESS',
          details: {
            server: req.server,
            tool: req.tool,
          },
        });
      }

      return {
        authorized: true,
        status: 'ALLOWED',
        interceptor_validation: interceptorResult,
        cedar_decision: cedarDecision,
        tool_output: parsed,
      };
    } catch (err) {
      return {
        authorized: true,
        status: 'FAILED',
        interceptor_validation: interceptorResult,
        cedar_decision: cedarDecision,
        error: err instanceof Error ? err.message : 'MCP execution failed.',
      };
    }
  }

  private async appendAuditInternal(payload: {
    alert_id: string;
    session_id: string;
    event_type: string;
    actor: string;
    action: string;
    outcome: 'SUCCESS' | 'DENIED' | 'FAILED' | 'INFO';
    details: Record<string, unknown>;
  }): Promise<void> {
    const client = this.clients.get('audit_mcp');
    if (!client) return;
    await client.callTool({
      name: 'append_event',
      arguments: payload,
    });
  }
}
