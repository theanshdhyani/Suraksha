/**
 * AWS Bedrock AgentCore Gateway — Lambda Request Interceptor Adapter
 * Validates signed single-use parental approval tokens & Cedar invariants before
 * Gateway routes requests to Tier 2 Family MCP.
 */
import { ApprovalService } from '../core/approvalService';
import { CedarPolicyEngine } from '../core/cedarPolicy';
import type { ApprovalToken, CedarEvaluationContext } from '../core/types';

const approvalService = new ApprovalService();
const cedarEngine = new CedarPolicyEngine();

export interface AgentCoreInterceptorEvent {
  mcp?: {
    gatewayRequest?: {
      headers?: Record<string, string>;
      body?: {
        method?: string;
        params?: {
          name?: string;
          arguments?: Record<string, unknown>;
        };
      };
    };
  };
}

export async function interceptorHandler(event: AgentCoreInterceptorEvent) {
  const req = event.mcp?.gatewayRequest;
  const toolName = req?.body?.params?.name || '';
  const args = req?.body?.params?.arguments || {};
  const headers = req?.headers || {};

  const rawTokenHeader = headers['x-suraksha-approval-token'];
  let parsedToken: ApprovalToken | null = null;
  if (rawTokenHeader) {
    try {
      parsedToken = JSON.parse(rawTokenHeader) as ApprovalToken;
    } catch {
      parsedToken = null;
    }
  }

  const isTier2 = toolName === 'alert_guardians' || toolName === 'send_family_voice_message';
  const action = isTier2 ? `family_mcp:${toolName}` : toolName;
  const alertId = String(args.alert_id || '');

  const tokenCheck = isTier2
    ? approvalService.validateAndConsumeToken({
        token: parsedToken,
        expected_alert_id: alertId,
        requested_action: action,
        consume: true,
      })
    : { valid: true, code: 'VALID' as const, reason: 'Tier 1 read-only' };

  const cedarCtx: CedarEvaluationContext = {
    caller_type: headers['x-suraksha-caller'] === 'LLM' ? 'LLM' : 'ORCHESTRATOR',
    origin: headers['x-suraksha-origin'] === 'LLM' ? 'LLM' : 'ORCHESTRATOR_LAMBDA',
    principal_id: headers['x-suraksha-principal'] || 'role/SurakshaOrchestratorLambda',
    action,
    resource: 'suraksha-agentcore-gateway',
    alert_id: alertId,
    approval_token_valid: tokenCheck.valid,
    approval_token_single_use_unused: tokenCheck.code !== 'REUSED' && tokenCheck.valid,
    approval_alert_match: tokenCheck.code !== 'ALERT_MISMATCH' && tokenCheck.valid,
    approval_action_scoped: tokenCheck.code !== 'UNAUTHORIZED_SCOPE' && tokenCheck.valid,
    parent_affirmative_utterance: parsedToken?.parent_utterance,
  };

  const cedarDecision = cedarEngine.evaluate(cedarCtx);

  if (!tokenCheck.valid || cedarDecision.decision !== 'ALLOW') {
    return {
      interceptorOutputVersion: '1.0',
      mcp: {
        transformedGatewayResponse: {
          statusCode: 403,
          body: {
            error: 'DENIED_BY_SURAKSHA_INTERCEPTOR',
            interceptor_code: tokenCheck.code,
            cedar_policy: cedarDecision.matched_policy_id,
            reason: !tokenCheck.valid ? tokenCheck.reason : cedarDecision.reason,
          },
        },
      },
    };
  }

  return {
    interceptorOutputVersion: '1.0',
    mcp: {
      transformedGatewayRequest: req,
    },
  };
}
