import crypto from 'node:crypto';
import type {
  AuditEvent,
  CallSession,
  EvidencePack,
  ScamAlert,
  URLCheckResult,
} from './types';

export const MANUAL_REPORTING_CHANNELS = [
  {
    channel: 'Chakshu (Sanchar Saathi)',
    target: 'https://sancharsaathi.gov.in/sfc/',
    instructions:
      'Open Sanchar Saathi Chakshu portal manually, choose "Report Suspected Fraud Communication", upload call details and screenshots.',
  },
  {
    channel: 'National Cybercrime Helpline',
    target: 'Dial 1930',
    instructions:
      'Call 1930 immediately if any financial detail was disclosed or a transfer was attempted so funds can be frozen.',
  },
  {
    channel: 'National Cyber Crime Reporting Portal',
    target: 'https://cybercrime.gov.in/',
    instructions:
      'File a formal complaint under "Report Other Cyber Crime" and attach this SURAKSHA Evidence Pack and integrity hash.',
  },
];

export function buildEvidencePack(params: {
  alert: ScamAlert;
  session: CallSession;
  auditEvents: AuditEvent[];
  urlChecks?: URLCheckResult[];
  latestAuditHash: string;
}): EvidencePack {
  const { alert, session, auditEvents, urlChecks = [], latestAuditHash } = params;

  const packCore = {
    evidence_id: `evd_${alert.alert_id.replace(/^alt_/, '')}`,
    alert_id: alert.alert_id,
    session_id: session.session_id,
    caller_label: alert.caller_label,
    caller_number: alert.caller_number,
    call_started_at: session.started_at,
    detected_at: alert.created_at,
    generated_at: new Date().toISOString(),
    rule_version: alert.evaluation.rule_version,
    rule_verdict: alert.evaluation.risk_level,
    risk_score: alert.evaluation.score,
    matched_categories: alert.evaluation.categories_detected,
    matched_indicators: alert.evaluation.matches,
    matched_playbook: alert.playbook,
    transcript_excerpts: session.transcript.filter((s) => !s.suppressed_echo),
    risk_explanation: alert.explanation,
    url_checks: urlChecks,
    event_timeline: auditEvents.map((e) => ({
      timestamp: e.timestamp,
      event_type: e.event_type,
      actor: e.actor,
      action: e.action,
      outcome: e.outcome,
    })),
    audit_integrity_hash: latestAuditHash,
    submission_status: 'EVIDENCE READY – MANUAL FAMILY SUBMISSION REQUIRED' as const,
    manual_reporting_channels: MANUAL_REPORTING_CHANNELS,
  };

  // Include deterministic digest verification suffix inside integrity hash field if needed
  const packDigest = crypto
    .createHash('sha256')
    .update(JSON.stringify({ alert_id: packCore.alert_id, latestAuditHash }))
    .digest('hex');

  return {
    ...packCore,
    audit_integrity_hash: `${latestAuditHash} (pack:${packDigest.slice(0, 16)})`,
  };
}

export function renderEvidencePackHtmlReport(pack: EvidencePack): string {
  const escapeHtml = (v: string) =>
    v
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const transcriptRows = pack.transcript_excerpts
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.iso_time)}</td><td>${escapeHtml(s.speaker)}</td><td>${escapeHtml(s.text)}</td></tr>`
    )
    .join('\n');

  const matchRows = pack.matched_indicators
    .map(
      (m) =>
        `<tr><td>${escapeHtml(m.category)}</td><td>${escapeHtml(m.rule_id)}</td><td>${escapeHtml(m.matched_phrase)}</td><td>+${m.weight}</td></tr>`
    )
    .join('\n');

  const timelineRows = pack.event_timeline
    .map(
      (t) =>
        `<tr><td>${escapeHtml(t.timestamp)}</td><td>${escapeHtml(t.event_type)}</td><td>${escapeHtml(t.actor)}</td><td>${escapeHtml(t.action)}</td><td>${escapeHtml(t.outcome)}</td></tr>`
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>SURAKSHA Evidence Pack — ${escapeHtml(pack.alert_id)}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; margin: 36px auto; max-width: 900px; line-height: 1.5; }
    h1, h2 { margin-top: 24px; }
    .banner { background: #fff7ed; border: 1px solid #fdba74; padding: 12px 16px; border-radius: 6px; font-weight: 600; color: #9a3412; }
    .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 24px; margin: 16px 0; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; }
    code { font-family: ui-monospace, monospace; font-size: 12px; word-break: break-all; }
  </style>
</head>
<body>
  <h1>SURAKSHA — Family Scam-Call Incident Evidence Pack</h1>
  <div class="banner">${escapeHtml(pack.submission_status)}</div>
  <div class="meta">
    <div><strong>Evidence ID:</strong> ${escapeHtml(pack.evidence_id)}</div>
    <div><strong>Alert ID:</strong> ${escapeHtml(pack.alert_id)}</div>
    <div><strong>Caller Label / Number:</strong> ${escapeHtml(pack.caller_label)} (${escapeHtml(pack.caller_number)})</div>
    <div><strong>Call Started:</strong> ${escapeHtml(pack.call_started_at)}</div>
    <div><strong>Rule Verdict:</strong> ${escapeHtml(pack.rule_verdict)} (${pack.risk_score}/100)</div>
    <div><strong>Rule Version:</strong> ${escapeHtml(pack.rule_version)}</div>
    <div><strong>Playbook:</strong> ${escapeHtml(pack.matched_playbook?.title ?? 'Unclassified / Multi-signal')}</div>
    <div><strong>Integrity Hash:</strong> <code>${escapeHtml(pack.audit_integrity_hash)}</code></div>
  </div>

  <h2>Risk Explanation (Context & Family Summary)</h2>
  <p>${escapeHtml(pack.risk_explanation?.family_risk_summary ?? 'No LLM explanation attached; deterministic Rule Engine triggered alert.')}</p>
  ${pack.risk_explanation?.hindi_explanation ? `<p><strong>Hindi/Hinglish Summary:</strong> ${escapeHtml(pack.risk_explanation.hindi_explanation)}</p>` : ''}

  <h2>Matched Scam Indicators</h2>
  <table>
    <thead><tr><th>Category</th><th>Rule ID</th><th>Matched Phrase</th><th>Weight</th></tr></thead>
    <tbody>${matchRows || '<tr><td colspan="4">None</td></tr>'}</tbody>
  </table>

  <h2>Transcript Excerpts</h2>
  <table>
    <thead><tr><th>Timestamp</th><th>Speaker</th><th>Utterance</th></tr></thead>
    <tbody>${transcriptRows || '<tr><td colspan="3">No transcript segments recorded</td></tr>'}</tbody>
  </table>

  <h2>Timestamped Audit Event Timeline</h2>
  <table>
    <thead><tr><th>Timestamp</th><th>Event Type</th><th>Actor</th><th>Action</th><th>Outcome</th></tr></thead>
    <tbody>${timelineRows || '<tr><td colspan="5">No audit events recorded</td></tr>'}</tbody>
  </table>

  <h2>Manual Reporting Instructions (No Automatic Submission)</h2>
  <ul>
    ${pack.manual_reporting_channels
      .map(
        (c) =>
          `<li><strong>${escapeHtml(c.channel)}</strong> (${escapeHtml(c.target)}): ${escapeHtml(c.instructions)}</li>`
      )
      .join('\n')}
  </ul>
</body>
</html>`;
}
