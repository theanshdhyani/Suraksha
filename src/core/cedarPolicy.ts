import type { CedarDecision, CedarEvaluationContext } from './types';

const TIER_1_ACTIONS = new Set([
  'listen_mcp:get_transcript_window',
  'scam_intel_mcp:match_scam_playbook',
  'scam_intel_mcp:score_signals',
  'scam_intel_mcp:check_url',
  'scam_intel_mcp:prepare_evidence_pack',
  'audit_mcp:append_event',
]);

const TIER_2_FAMILY_ACTIONS = new Set([
  'family_mcp:alert_guardians',
  'family_mcp:send_family_voice_message',
]);

const EXPLICITLY_FORBIDDEN_ACTIONS = new Set([
  'reply_to_scammer',
  'converse_with_scammer',
  'auto_submit_chakshu',
  'execute_upi_payment',
  'audit_mcp:delete_event',
  'audit_mcp:update_event',
]);

/**
 * Local deterministic Cedar Policy evaluator matching `policies/suraksha.cedar`.
 * Enforces:
 * 1. Forbid-Wins semantics
 * 2. Default-Deny semantics
 * 3. Policy evaluation strictly outside the LLM
 * 4. Tier 1 vs Tier 2 explicit parental approval separation
 */
export class CedarPolicyEngine {
  public evaluate(ctx: CedarEvaluationContext): CedarDecision {
    const now = new Date().toISOString();

    // 1. FORBID-WINS: Explicitly forbidden safety & audit immutability actions
    if (EXPLICITLY_FORBIDDEN_ACTIONS.has(ctx.action)) {
      return {
        decision: 'DENY',
        effect: 'FORBID',
        matched_policy_id: 'cedar-forbid-unsafe-operations',
        reason: `Cedar FORBID rule blocked prohibited action "${ctx.action}".`,
        evaluated_at: now,
      };
    }

    // 2. FORBID-WINS: LLM can NEVER authorize or invoke Tier 2 family operations
    if (
      TIER_2_FAMILY_ACTIONS.has(ctx.action) &&
      (ctx.origin === 'LLM' || ctx.caller_type === 'LLM' || ctx.llm_override_attempted)
    ) {
      return {
        decision: 'DENY',
        effect: 'FORBID',
        matched_policy_id: 'cedar-forbid-llm-family-override',
        reason: 'Cedar FORBID rule: LLM cannot authorize or invoke Tier 2 Family MCP tools.',
        evaluated_at: now,
      };
    }

    // 3. FORBID-WINS: Frontend cannot bypass AgentCore Gateway directly
    if (ctx.caller_type === 'FRONTEND_DIRECT' && TIER_2_FAMILY_ACTIONS.has(ctx.action)) {
      return {
        decision: 'DENY',
        effect: 'FORBID',
        matched_policy_id: 'cedar-forbid-direct-frontend-tier2',
        reason: 'Cedar FORBID rule: Direct frontend invocation of Family MCP bypassed Gateway/Approval.',
        evaluated_at: now,
      };
    }

    // 4. FORBID-WINS: Any Tier 2 action without valid single-use alert-bound approval
    if (
      TIER_2_FAMILY_ACTIONS.has(ctx.action) &&
      (!ctx.approval_token_valid ||
        !ctx.approval_token_single_use_unused ||
        !ctx.approval_alert_match ||
        !ctx.approval_action_scoped ||
        ctx.parent_affirmative_utterance?.toLowerCase().includes('haan') !== true)
    ) {
      return {
        decision: 'DENY',
        effect: 'FORBID',
        matched_policy_id: 'cedar-forbid-unapproved-tier2',
        reason:
          'Cedar FORBID rule: Tier 2 Family MCP requires valid, single-use, alert-bound parental "haan" approval token.',
        evaluated_at: now,
      };
    }

    // 5. PERMIT: Tier 1 tools for authenticated Orchestrator
    if (TIER_1_ACTIONS.has(ctx.action) && ctx.caller_type === 'ORCHESTRATOR') {
      return {
        decision: 'ALLOW',
        effect: 'PERMIT',
        matched_policy_id: 'cedar-permit-tier1-orchestrator',
        reason: `Cedar PERMIT: Tier 1 tool "${ctx.action}" allowed for Orchestrator without parental token.`,
        evaluated_at: now,
      };
    }

    // 6. PERMIT: Tier 2 Family MCP tools with all verified approval invariants
    if (
      TIER_2_FAMILY_ACTIONS.has(ctx.action) &&
      ctx.caller_type === 'ORCHESTRATOR' &&
      ctx.approval_token_valid &&
      ctx.approval_token_single_use_unused &&
      ctx.approval_alert_match &&
      ctx.approval_action_scoped
    ) {
      return {
        decision: 'ALLOW',
        effect: 'PERMIT',
        matched_policy_id: 'cedar-permit-tier2-approved-family',
        reason: `Cedar PERMIT: Tier 2 tool "${ctx.action}" authorized via verified parental approval.`,
        evaluated_at: now,
      };
    }

    // 7. DEFAULT-DENY
    return {
      decision: 'DENY',
      effect: 'DEFAULT_DENY',
      matched_policy_id: 'cedar-default-deny',
      reason: `Cedar DEFAULT-DENY: No explicit permit rule matched principal="${ctx.principal_id}" action="${ctx.action}".`,
      evaluated_at: now,
    };
  }
}
