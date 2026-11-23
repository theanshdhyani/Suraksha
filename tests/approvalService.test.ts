import assert from 'node:assert/strict';
import test from 'node:test';
import { ApprovalService, isExplicitAffirmativeHaan } from '../src/core/approvalService';

test('Explicit "haan" matching accepts affirmative Hindi/Hinglish and rejects ambiguous speech', () => {
  assert.equal(isExplicitAffirmativeHaan('haan'), true);
  assert.equal(isExplicitAffirmativeHaan('Haan bula lo'), true);
  assert.equal(isExplicitAffirmativeHaan('हाँ'), true);
  assert.equal(isExplicitAffirmativeHaan('theek hai dekhte hain'), false);
  assert.equal(isExplicitAffirmativeHaan('hello kaun bol raha'), false);
  assert.equal(isExplicitAffirmativeHaan('nahi'), false);
});

test('Approval Service issues signed token on valid "haan" and validates single-use & alert binding', () => {
  const svc = new ApprovalService({ signingSecret: 'test-secret-key', ttlMs: 10_000 });
  svc.registerActiveAlert('alt_123');

  const now = 1_700_000_000_000;
  const token = svc.issueApprovalToken({
    alert_id: 'alt_123',
    approver_id: 'parent-1',
    utterance: 'haan',
    nowMs: now,
  });

  assert.equal(token.alert_id, 'alt_123');
  assert.equal(token.usage_status, 'UNUSED');
  assert.ok(token.signature.length === 64);

  // Valid consumption succeeds once
  const firstCheck = svc.validateAndConsumeToken({
    token,
    expected_alert_id: 'alt_123',
    requested_action: 'family_mcp:alert_guardians',
    nowMs: now + 1000,
  });
  assert.equal(firstCheck.valid, true);
  assert.equal(firstCheck.code, 'VALID');

  // Reused token is strictly rejected
  const reuseCheck = svc.validateAndConsumeToken({
    token,
    expected_alert_id: 'alt_123',
    requested_action: 'family_mcp:alert_guardians',
    nowMs: now + 2000,
  });
  assert.equal(reuseCheck.valid, false);
  assert.equal(reuseCheck.code, 'REUSED');
});

test('Approval Service rejects missing, expired, wrong alert_id, tampered, forged signature, and unauthorized scope', () => {
  const svc = new ApprovalService({ signingSecret: 'test-secret-key', ttlMs: 5000 });
  svc.registerActiveAlert('alt_abc');

  const baseNow = 1_700_000_000_000;
  const token = svc.issueApprovalToken({
    alert_id: 'alt_abc',
    approver_id: 'parent-1',
    utterance: 'haan',
    permitted_actions: ['family_mcp:alert_guardians'],
    nowMs: baseNow,
  });

  // Missing token
  assert.equal(
    svc.validateAndConsumeToken({
      token: null,
      expected_alert_id: 'alt_abc',
      requested_action: 'family_mcp:alert_guardians',
    }).code,
    'MISSING_TOKEN'
  );

  // Invalid signature
  assert.equal(
    svc.validateAndConsumeToken({
      token: { ...token, signature: 'a'.repeat(64) },
      expected_alert_id: 'alt_abc',
      requested_action: 'family_mcp:alert_guardians',
      consume: false,
      nowMs: baseNow + 100,
    }).code,
    'INVALID_SIGNATURE'
  );

  // Tampered payload (signature fails because canonical payload changed)
  assert.equal(
    svc.validateAndConsumeToken({
      token: { ...token, alert_id: 'alt_hacked' },
      expected_alert_id: 'alt_hacked',
      requested_action: 'family_mcp:alert_guardians',
      consume: false,
      nowMs: baseNow + 100,
    }).code,
    'INVALID_SIGNATURE'
  );

  // Alert ID mismatch
  assert.equal(
    svc.validateAndConsumeToken({
      token,
      expected_alert_id: 'alt_other',
      requested_action: 'family_mcp:alert_guardians',
      consume: false,
      nowMs: baseNow + 100,
    }).code,
    'ALERT_MISMATCH'
  );

  // Unauthorized tool scope
  assert.equal(
    svc.validateAndConsumeToken({
      token,
      expected_alert_id: 'alt_abc',
      requested_action: 'family_mcp:send_family_voice_message',
      consume: false,
      nowMs: baseNow + 100,
    }).code,
    'UNAUTHORIZED_SCOPE'
  );

  // Expired token
  assert.equal(
    svc.validateAndConsumeToken({
      token,
      expected_alert_id: 'alt_abc',
      requested_action: 'family_mcp:alert_guardians',
      consume: false,
      nowMs: baseNow + 10_000,
    }).code,
    'EXPIRED'
  );
});
