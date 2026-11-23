import assert from 'node:assert/strict';
import test from 'node:test';
import { renderEvidencePackHtmlReport } from '../src/core/evidencePack';
import { SurakshaOrchestrator } from '../src/services/orchestrator';
import { analyzeSuspiciousMessageAndLinks } from '../src/services/scamDrillService';

test('End-to-end scam call: progressive transcript -> Rule Engine -> interruption -> haan approval -> Gateway/Cedar -> SNS -> Evidence Pack -> Hash Chain + Blocked Unauthorized Action', async () => {
  const orch = new SurakshaOrchestrator({ auditPersistPath: null });

  // Verify integrations operate in DEMO/MOCK without crashing
  const statuses = await orch.providers.runAllHealthChecks();
  assert.ok(statuses.some((s) => s.id === 'elevenlabs_scribe' && s.status === 'MOCK'));
  assert.ok(statuses.some((s) => s.id === 'amazon_bedrock' && s.status === 'MOCK'));

  // Independent LIVE mode switch with missing credentials produces PENDING CONFIGURATION (no crash)
  orch.providers.setServiceMode('amazon_sns', 'LIVE');
  const updatedStatuses = await orch.providers.runAllHealthChecks();
  const snsLive = updatedStatuses.find((s) => s.id === 'amazon_sns');
  assert.equal(snsLive?.status, 'PENDING CONFIGURATION');
  // Switch SNS back to MOCK for E2E notification delivery
  orch.providers.setServiceMode('amazon_sns', 'MOCK');

  const session = orch.startSession({ scenario_id: 'cbi_digital_arrest' });

  // Progressive segments
  const step1 = await orch.ingestTranscriptSegment({
    session_id: session.session_id,
    speaker: 'CALLER',
    text: 'Hello main CBI Cyber Cell Mumbai Police inspector bol raha hoon.',
    timestamp_ms: 1_700_000_001_000,
  });
  assert.equal(step1.alert, undefined);

  // High-risk combination triggers alert + consented family prompt immediately
  const step2 = await orch.ingestTranscriptSegment({
    session_id: session.session_id,
    speaker: 'CALLER',
    text: 'Aapke naam par digital arrest warrant aur FIR darj hai. Ghar walon ko mat batana, video call pe raho aur RBI verification account mein paise transfer karo.',
    timestamp_ms: 1_700_000_004_000,
  });

  assert.ok(step2.alert);
  const alertId = step2.alert!.alert_id;
  assert.equal(step2.alert!.interruption_prompt, 'Kya main Ansh ko abhi bula loon?');
  assert.equal(step2.alert!.lifecycle_state, 'APPROVAL_PENDING');
  assert.ok(step2.tts_interruption?.consented);
  assert.ok(step2.alert!.explanation?.hindi_explanation);

  // Echo suppression prevents system prompt echo from re-triggering caller detection
  const echoAttempt = await orch.ingestTranscriptSegment({
    session_id: session.session_id,
    speaker: 'CALLER',
    text: 'Kya main Ansh ko abhi bula loon?',
    timestamp_ms: 1_700_000_005_000,
  });
  assert.equal(echoAttempt.echo_suppressed, true);

  // Demonstrate blocked unauthorized call BEFORE parent approves
  const deniedAttempt = await orch.testUnauthorizedGatewayCall({
    alert_id: alertId,
    scenario: 'MISSING_TOKEN',
  });
  assert.equal(deniedAttempt.status, 'DENIED');
  assert.equal(deniedAttempt.authorized, false);

  // Ambiguous utterance does NOT approve
  const rejected = await orch.submitParentalResponse({
    alert_id: alertId,
    utterance: 'abhi ruk jao',
  });
  assert.equal(rejected.approved, false);

  // Explicit "haan" issues signed token -> Gateway -> Cedar -> Family MCP -> SNS -> Evidence Pack
  const approved = await orch.submitParentalResponse({
    alert_id: alertId,
    utterance: 'haan',
  });
  assert.equal(approved.approved, true);
  assert.ok(approved.token);
  assert.equal(approved.gateway_result?.status, 'ALLOWED');
  assert.equal(approved.alert.lifecycle_state, 'EVIDENCE_READY');
  assert.equal(approved.alert.notifications.length, 1);
  assert.ok(approved.evidence_pack);
  assert.equal(
    approved.evidence_pack?.submission_status,
    'EVIDENCE READY – MANUAL FAMILY SUBMISSION REQUIRED'
  );

  // Downloadable HTML evidence report renders cleanly
  const html = renderEvidencePackHtmlReport(approved.evidence_pack!);
  assert.ok(html.includes(alertId));
  assert.ok(html.includes('Chakshu'));

  // Hash-chained audit log verifies completely and contains both AUTHZ_ALLOW and AUTHZ_DENY
  const verify = orch.auditLog.verifyIntegrity();
  assert.equal(verify.valid, true);
  const events = orch.auditLog.getByAlert(alertId);
  assert.ok(events.some((e) => e.event_type === 'AUTHZ_DENY'));
  assert.ok(events.some((e) => e.event_type === 'AUTHZ_ALLOW'));
  assert.ok(events.some((e) => e.event_type === 'EVIDENCE_GENERATED'));

  // Secondary message & URL checker works offline without fetching URLs
  const msgCheck = analyzeSuspiciousMessageAndLinks({
    messageText: 'Urgent SBI KYC blocked today! Share OTP or click https://sbi-kyc-update-verify.xyz/login',
  });
  assert.equal(msgCheck.never_opened_links, true);
  assert.equal(msgCheck.url_checks[0]?.verdict, 'MALICIOUS');

  // Verify PB_DIGITAL_ARREST matched rather than parcel extortion when digital arrest phrase was detected
  assert.equal(approved.evidence_pack?.matched_playbook?.playbook_id, 'PB_DIGITAL_ARREST');

  // Duplicate "haan" approval is rejected idempotently without sending a second SNS alert
  const duplicateApproval = await orch.submitParentalResponse({
    alert_id: alertId,
    utterance: 'haan',
  });
  assert.equal(duplicateApproval.approved, false);
  assert.equal(duplicateApproval.alert.notifications.length, 1);
});

test('Playbook matcher selects PB_DIGITAL_ARREST on Digital Arrest signals even before isolation phrase', async () => {
  const orch = new SurakshaOrchestrator({ auditPersistPath: null });
  const session = orch.startSession({ scenario_id: 'cbi_digital_arrest' });

  const seg = await orch.ingestTranscriptSegment({
    session_id: session.session_id,
    speaker: 'CALLER',
    text: 'FedEx parcel CBI officer Mumbai Police cyber cell FIR and digital arrest warrant.',
    timestamp_ms: 1_700_000_010_000,
  });

  assert.ok(seg.alert);
  assert.equal(seg.alert!.playbook?.playbook_id, 'PB_DIGITAL_ARREST');
});
