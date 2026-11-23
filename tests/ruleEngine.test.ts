import assert from 'node:assert/strict';
import test from 'node:test';
import { DeterministicRuleEngine } from '../src/core/ruleEngine';
import type { TranscriptSegment } from '../src/core/types';

function seg(
  id: string,
  text: string,
  offsetMs = 0,
  speaker: 'CALLER' | 'PARENT' = 'CALLER'
): TranscriptSegment {
  const ts = 1_700_000_000_000 + offsetMs;
  return {
    id,
    session_id: 'test-ses',
    speaker,
    text,
    language: 'hinglish',
    timestamp_ms: ts,
    iso_time: new Date(ts).toISOString(),
    is_partial: false,
  };
}

test('Normal conversation does NOT trigger high-risk alert', () => {
  const engine = new DeterministicRuleEngine();
  const res = engine.evaluateWindow('ses-normal', [
    seg('1', 'Namaste aunty, main Dr. Sharma clinic se bol rahi hoon.', 1000),
    seg('2', 'Aapka Thursday ka appointment confirm karna tha.', 3000),
    seg('3', 'Bank branch mein kaam ho toh aaram se kar lena, koi jaldi nahi.', 5000),
  ]);
  assert.equal(res.high_risk_triggered, false);
  assert.equal(res.risk_level, 'LOW');
  assert.ok(res.score < 55);
});

test('Single isolated keyword does NOT cross high-risk threshold', () => {
  const engine = new DeterministicRuleEngine();
  const res = engine.evaluateWindow('ses-single', [
    seg('1', 'Sir aapka OTP verify karne ke liye link bheja tha.', 1000),
  ]);
  assert.equal(res.high_risk_triggered, false);
  assert.ok(res.score < 55);
});

test('Fake bank OTP + urgency triggers HIGH risk', () => {
  const engine = new DeterministicRuleEngine();
  const res = engine.evaluateWindow('ses-bank', [
    seg('1', 'Main SBI KYC department se bol raha hoon, account 10 minute mein blocked hoga.', 1000),
    seg('2', 'Turant apna 6 digit OTP batao aur ATM PIN confirm karo.', 3000),
  ]);
  assert.equal(res.high_risk_triggered, true);
  assert.ok(res.categories_detected.includes('FAKE_AUTHORITY'));
  assert.ok(res.categories_detected.includes('URGENCY'));
  assert.ok(res.categories_detected.includes('MONEY_CREDENTIALS'));
});

test('Fake police impersonation + digital arrest + isolation triggers CRITICAL risk', () => {
  const engine = new DeterministicRuleEngine();
  const res = engine.evaluateWindow('ses-cbi', [
    seg('1', 'Main CBI Cyber Cell Mumbai Police inspector bol raha hoon.', 1000),
    seg('2', 'Aapke naam par digital arrest warrant aur FIR darj ho gayi hai.', 3000),
    seg('3', 'Ghar walon ko mat batana, video call pe raho aur RBI verification account mein paise transfer karo.', 5000),
  ]);
  assert.equal(res.high_risk_triggered, true);
  assert.equal(res.risk_level, 'CRITICAL');
  assert.ok(res.categories_detected.includes('ISOLATION'));
  assert.ok(res.categories_detected.includes('THREATS'));
  assert.ok(res.categories_detected.includes('MONEY_CREDENTIALS'));
});

test('Remote access AnyDesk + urgency triggers HIGH risk', () => {
  const engine = new DeterministicRuleEngine();
  const res = engine.evaluateWindow('ses-remote', [
    seg('1', 'TRAI compliance warning: SIM will be suspended within 15 minutes.', 1000),
    seg('2', 'Turant AnyDesk install karo aur screen share karo.', 4000),
  ]);
  assert.equal(res.high_risk_triggered, true);
  assert.ok(res.categories_detected.includes('REMOTE_ACCESS'));
});

test('Devanagari Hindi scam transcript is detected accurately', () => {
  const engine = new DeterministicRuleEngine();
  const res = engine.evaluateWindow('ses-hindi', [
    seg('1', 'मैं सीबीआई पुलिस से बोल रहा हूँ, आपके खिलाफ डिजिटल अरेस्ट वारंट जारी हुआ है।', 1000),
    seg('2', 'किसी को मत बताना और तुरंत ओटीपी बताइए वरना खाता बंद हो जाएगा।', 4000),
  ]);
  assert.equal(res.high_risk_triggered, true);
  assert.ok(res.score >= 70);
});

test('Rolling window excludes stale segments older than 18s and deduplicates repeat alerts', () => {
  const engine = new DeterministicRuleEngine({ windowMs: 18_000 });
  const oldSeg = seg('old', 'CBI digital arrest warrant kisi ko mat batana', 0);
  const lateSeg = seg('late', 'Hello kaise hain aap?', 25_000);
  const staleCheck = engine.evaluateWindow('ses-roll', [oldSeg, lateSeg], 25_000);
  assert.equal(staleCheck.high_risk_triggered, false);

  const first = engine.evaluateWindow('ses-dedup', [
    seg('a', 'CBI inspector digital arrest warrant', 1000),
    seg('b', 'Ghar walon ko mat batana paise bhejo', 2000),
  ]);
  assert.equal(first.high_risk_triggered, true);
  assert.equal(first.deduplicated, false);

  const second = engine.evaluateWindow('ses-dedup', [
    seg('a', 'CBI inspector digital arrest warrant', 1000),
    seg('b', 'Ghar walon ko mat batana paise bhejo', 2000),
    seg('c', 'Call mat katna', 3000),
  ]);
  assert.equal(second.deduplicated, true);
  assert.equal(second.high_risk_triggered, false);
});
