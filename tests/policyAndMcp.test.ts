import assert from 'node:assert/strict';
import test from 'node:test';
import { ApprovalService } from '../src/core/approvalService';
import { HashChainedAuditLog } from '../src/core/auditChain';
import { CedarPolicyEngine } from '../src/core/cedarPolicy';
import { createAuditMcpServer } from '../src/mcp/auditMcp';
import { createFamilyMcpServer } from '../src/mcp/familyMcp';
import { AgentCoreGatewayRouter } from '../src/mcp/gatewayRouter';
import { createListenMcpServer } from '../src/mcp/listenMcp';
import { createScamIntelMcpServer } from '../src/mcp/scamIntelMcp';
import { ProviderRegistry } from '../src/providers/factory';
import type { CallSession, GuardianNotification, ScamAlert } from '../src/core/types';

test('Cedar Policy enforces Default-Deny and Forbid-Wins outside LLM', () => {
  const cedar = new CedarPolicyEngine();

  // Default deny for unknown caller/action
  const unknown = cedar.evaluate({
    caller_type: 'GUARDIAN',
    origin: 'EXTERNAL',
    principal_id: 'random-user',
    action: 'family_mcp:alert_guardians',
    resource: 'suraksha-agentcore-gateway',
  });
  assert.equal(unknown.decision, 'DENY');

  // Forbid-wins when LLM attempts override even if token fields look true
  const llmOverride = cedar.evaluate({
    caller_type: 'LLM',
    origin: 'LLM',
    principal_id: 'bedrock-agent',
    action: 'family_mcp:alert_guardians',
    resource: 'suraksha-agentcore-gateway',
    approval_token_valid: true,
    approval_token_single_use_unused: true,
    approval_alert_match: true,
    approval_action_scoped: true,
    parent_affirmative_utterance: 'haan',
    llm_override_attempted: true,
  });
  assert.equal(llmOverride.decision, 'DENY');
  assert.equal(llmOverride.effect, 'FORBID');

  // Forbid scammer reply
  const scammerReply = cedar.evaluate({
    caller_type: 'ORCHESTRATOR',
    origin: 'ORCHESTRATOR_LAMBDA',
    principal_id: 'role/SurakshaOrchestratorLambda',
    action: 'reply_to_scammer',
    resource: 'suraksha-agentcore-gateway',
  });
  assert.equal(scammerReply.decision, 'DENY');
  assert.equal(scammerReply.effect, 'FORBID');
});

test('MCP Gateway allows Tier 1 without token, blocks Tier 2 without token, and executes Tier 2 with valid token', async () => {
  const providers = new ProviderRegistry();
  const approval = new ApprovalService({ signingSecret: 'mcp-test-secret' });
  const auditLog = new HashChainedAuditLog(null);

  const sessions = new Map<string, CallSession>();
  const alerts = new Map<string, ScamAlert>();
  const notifications: GuardianNotification[] = [];

  sessions.set('ses_1', {
    session_id: 'ses_1',
    scenario_id: 'cbi_digital_arrest',
    scenario_title: 'Test',
    caller_label: 'CBI Caller',
    caller_number: '+91 99999',
    parent_name: 'Maa',
    guardian_name: 'Ansh',
    status: 'INTERRUPTED',
    started_at: new Date().toISOString(),
    echo_suppression_active: false,
    transcript: [
      {
        id: 'seg_1',
        session_id: 'ses_1',
        speaker: 'CALLER',
        text: 'Digital arrest warrant',
        language: 'en',
        timestamp_ms: Date.now(),
        iso_time: new Date().toISOString(),
        is_partial: false,
      },
    ],
  });

  alerts.set('alt_1', {
    alert_id: 'alt_1',
    session_id: 'ses_1',
    caller_label: 'CBI Caller',
    caller_number: '+91 99999',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    lifecycle_state: 'APPROVAL_PENDING',
    evaluation: {
      rule_version: 'v1',
      window_start_ms: 0,
      window_end_ms: 1000,
      window_duration_ms: 18000,
      segments_evaluated: 1,
      score: 85,
      threshold: 55,
      risk_level: 'CRITICAL',
      high_risk_triggered: true,
      categories_detected: ['FAKE_AUTHORITY', 'THREATS'],
      matches: [],
      deduplicated: false,
      evaluation_latency_ms: 1,
      verdict_summary: 'Critical',
    },
    explanation: null,
    interruption_prompt: 'Kya main Ansh ko abhi bula loon?',
    approval_status: 'PENDING',
    playbook: null,
    notifications: [],
    denied_attempts: [],
    timeline: [],
  });

  approval.registerActiveAlert('alt_1');

  const gateway = new AgentCoreGatewayRouter(
    {
      listen_mcp: createListenMcpServer({ getSession: (id) => sessions.get(id) }),
      scam_intel_mcp: createScamIntelMcpServer({
        providers,
        getAlert: (id) => alerts.get(id),
        getSession: (id) => sessions.get(id),
        getAuditEventsForAlert: (id) => auditLog.getByAlert(id),
        getLatestAuditHash: () => auditLog.verifyIntegrity().latest_hash,
        saveEvidencePack: () => {},
      }),
      family_mcp: createFamilyMcpServer({
        providers,
        getAlert: (id) => alerts.get(id),
        recordNotification: (_id, n) => notifications.push(n),
      }),
      audit_mcp: createAuditMcpServer({ auditLog, providers }),
    },
    approval
  );

  // 1. Tier 1 Listen MCP succeeds without parental approval
  const tier1 = await gateway.invokeTool({
    server: 'listen_mcp',
    tool: 'get_transcript_window',
    arguments: { session_id: 'ses_1', alert_id: 'alt_1', window_ms: 18000 },
    caller_type: 'ORCHESTRATOR',
    origin: 'ORCHESTRATOR_LAMBDA',
    principal_id: 'role/SurakshaOrchestratorLambda',
    alert_id: 'alt_1',
    session_id: 'ses_1',
  });
  assert.equal(tier1.authorized, true);
  assert.equal(tier1.status, 'ALLOWED');

  // 2. Tier 2 Family MCP without token MUST be DENIED and NEVER invoke Family MCP
  const tier2Denied = await gateway.invokeTool({
    server: 'family_mcp',
    tool: 'alert_guardians',
    arguments: { alert_id: 'alt_1', guardian_name: 'Ansh', summary: 'Help' },
    caller_type: 'ORCHESTRATOR',
    origin: 'ORCHESTRATOR_LAMBDA',
    principal_id: 'role/SurakshaOrchestratorLambda',
    alert_id: 'alt_1',
    session_id: 'ses_1',
    approval_token: null,
  });
  assert.equal(tier2Denied.authorized, false);
  assert.equal(tier2Denied.status, 'DENIED');
  assert.equal(notifications.length, 0);

  // 3. Tier 2 Family MCP with valid token succeeds once
  const validToken = approval.issueApprovalToken({
    alert_id: 'alt_1',
    approver_id: 'parent-1',
    utterance: 'haan',
  });
  const tier2Allowed = await gateway.invokeTool({
    server: 'family_mcp',
    tool: 'alert_guardians',
    arguments: { alert_id: 'alt_1', guardian_name: 'Ansh', summary: 'Help' },
    caller_type: 'ORCHESTRATOR',
    origin: 'ORCHESTRATOR_LAMBDA',
    principal_id: 'role/SurakshaOrchestratorLambda',
    alert_id: 'alt_1',
    session_id: 'ses_1',
    approval_token: validToken,
  });
  assert.equal(tier2Allowed.authorized, true);
  assert.equal(tier2Allowed.status, 'ALLOWED');
  assert.equal(notifications.length, 1);

  // 4. Reusing the same token is DENIED and does NOT send a second notification
  const tier2Replay = await gateway.invokeTool({
    server: 'family_mcp',
    tool: 'alert_guardians',
    arguments: { alert_id: 'alt_1', guardian_name: 'Ansh', summary: 'Replay' },
    caller_type: 'ORCHESTRATOR',
    origin: 'ORCHESTRATOR_LAMBDA',
    principal_id: 'role/SurakshaOrchestratorLambda',
    alert_id: 'alt_1',
    session_id: 'ses_1',
    approval_token: validToken,
  });
  assert.equal(tier2Replay.authorized, false);
  assert.equal(tier2Replay.status, 'DENIED');
  assert.equal(notifications.length, 1);
});
