// =============================================================================
// SURAKSHA — Amazon Bedrock AgentCore Gateway Cedar Policies
// Semantics: Default-Deny + Forbid-Wins (Policy enforcement outside the LLM)
// =============================================================================

// 1. Tier 1 Read-Only & Threat Intelligence MCP Tools (No Parental Approval Required)
// Listen MCP & Scam-Intel MCP are permitted for the authenticated Orchestrator service.
permit(
    principal in AgentCore::IamEntity::"role/SurakshaOrchestratorLambda",
    action in [
        AgentCore::Action::"InvokeTool::listen_mcp::get_transcript_window",
        AgentCore::Action::"InvokeTool::scam_intel_mcp::match_scam_playbook",
        AgentCore::Action::"InvokeTool::scam_intel_mcp::score_signals",
        AgentCore::Action::"InvokeTool::scam_intel_mcp::check_url",
        AgentCore::Action::"InvokeTool::scam_intel_mcp::prepare_evidence_pack",
        AgentCore::Action::"InvokeTool::audit_mcp::append_event"
    ],
    resource == AgentCore::Gateway::"suraksha-agentcore-gateway"
) when {
    context.caller_type == "ORCHESTRATOR"
};

// 2. Tier 2 Family Intervention MCP Tools (MANDATORY Explicit Parental Approval)
// Requires a valid, unexpired, single-use, alert-bound cryptographic approval token.
permit(
    principal in AgentCore::OAuthUser::"suraksha-parent-approved-session",
    action in [
        AgentCore::Action::"InvokeTool::family_mcp::alert_guardians",
        AgentCore::Action::"InvokeTool::family_mcp::send_family_voice_message"
    ],
    resource == AgentCore::Gateway::"suraksha-agentcore-gateway"
) when {
    context.approval_token_valid == true &&
    context.approval_token_single_use_unused == true &&
    context.approval_alert_match == true &&
    context.approval_action_scoped == true &&
    context.parent_affirmative_utterance == "haan"
};

// 3. EXPLICIT FORBID-WINS GUARDRAILS
// Never allow an LLM / Bedrock component to authorize or invoke Tier 2 Family MCP tools.
forbid(
    principal,
    action in [
        AgentCore::Action::"InvokeTool::family_mcp::alert_guardians",
        AgentCore::Action::"InvokeTool::family_mcp::send_family_voice_message"
    ],
    resource
) when {
    context.origin == "LLM" ||
    context.llm_override_attempted == true ||
    context.approval_token_valid != true
};

// 4. EXPLICIT FORBID-WINS: Never converse with suspected scammer or auto-submit reports.
forbid(
    principal,
    action in [
        AgentCore::Action::"InvokeTool::reply_to_scammer",
        AgentCore::Action::"InvokeTool::auto_submit_chakshu",
        AgentCore::Action::"InvokeTool::execute_upi_payment",
        AgentCore::Action::"InvokeTool::audit_mcp::delete_event",
        AgentCore::Action::"InvokeTool::audit_mcp::update_event"
    ],
    resource
);
