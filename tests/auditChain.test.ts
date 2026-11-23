import assert from 'node:assert/strict';
import test from 'node:test';
import { GENESIS_HASH, HashChainedAuditLog } from '../src/core/auditChain';

test('Hash-chained Audit Log validates previous_event_hash, event_hash, and detects historical tampering', () => {
  const log = new HashChainedAuditLog(null);

  const e1 = log.append({
    alert_id: 'alt_1',
    session_id: 'ses_1',
    event_type: 'DETECTION',
    actor: 'rule-engine',
    action: 'detect',
    outcome: 'SUCCESS',
  });
  assert.equal(e1.previous_event_hash, GENESIS_HASH);

  const e2 = log.append({
    alert_id: 'alt_1',
    session_id: 'ses_1',
    event_type: 'AUTHZ_DENY',
    actor: 'gateway',
    action: 'blocked_family_mcp',
    outcome: 'DENIED',
  });
  assert.equal(e2.previous_event_hash, e1.event_hash);

  const validCheck = log.verifyIntegrity();
  assert.equal(validCheck.valid, true);
  assert.equal(validCheck.total_events, 2);

  // Simulate historical modification of seq 1
  log._unsafeSimulateTamperForVerificationTest(1, 'tampered_action');
  const tamperedCheck = log.verifyIntegrity();
  assert.equal(tamperedCheck.valid, false);
  assert.equal(tamperedCheck.broken_at_seq, 1);
});
