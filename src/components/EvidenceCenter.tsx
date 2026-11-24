import { useEffect, useState } from 'react';
import { CheckCircle2, Download, FileWarning, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import type { AuditEvent, AuditVerificationResult, EvidencePack } from '../core/types';
import type { NavPage } from './ProtectionDashboard';

interface EvidenceCenterProps {
  onNavigate: (page: NavPage) => void;
}

export function EvidenceCenter({ onNavigate }: EvidenceCenterProps) {
  const [packs, setPacks] = useState<EvidencePack[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [verification, setVerification] = useState<AuditVerificationResult | null>(null);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

  const loadEvidence = async () => {
    try {
      const [evRes, auditRes] = await Promise.all([api.getEvidencePacks(), api.getAudit()]);
      setPacks(evRes.evidence_packs);
      setAuditEvents(auditRes.events);
      setVerification(auditRes.verification);
      if (evRes.evidence_packs.length > 0 && !selectedAlertId) {
        setSelectedAlertId(evRes.evidence_packs[0].alert_id);
      }
    } catch {
      // Preserves clean empty state if backend is unreachable
    }
  };

  useEffect(() => {
    void loadEvidence();
  }, []);

  const verifyNow = async () => {
    try {
      const res = await api.verifyAudit();
      setVerification(res);
    } catch {
      // Ignore transient failure
    }
  };

  const selected = packs.find((p) => p.alert_id === selectedAlertId) || packs[0] || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Evidence Center</h1>
          <p className="text-xs text-slate-500 mt-1">
            Tamper-evident incident packages, SHA-256 hash-chain verification, and manual reporting
            instructions
          </p>
        </div>
        <button
          type="button"
          onClick={verifyNow}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer whitespace-nowrap"
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Verify Audit Hash Chain</span>
        </button>
      </div>

      {/* Audit Integrity Status Banner */}
      {verification && (
        <section
          className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
            verification.valid
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-300 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <div>
              <span className="font-semibold">
                Hash-Chained Audit Log Integrity: {verification.valid ? 'VERIFIED' : 'TAMPERED'}
              </span>{' '}
              — {verification.reason}
            </div>
          </div>
          <div className="font-mono tabular-nums text-[11px]">
            Latest SHA-256: {verification.latest_hash.slice(0, 18)}…
          </div>
        </section>
      )}

      {packs.length === 0 ? (
        <section className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
          <p className="text-sm font-semibold text-slate-800">No Evidence Packs compiled yet</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Complete a Live Guard scam simulation and confirm with &ldquo;haan&rdquo; to generate a
            tamper-evident Evidence Pack for manual family reporting.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('live-guard')}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer"
          >
            Run Live Guard Simulation
          </button>
        </section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Pack selector */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {packs.map((pack) => (
              <button
                key={pack.evidence_id}
                type="button"
                onClick={() => setSelectedAlertId(pack.alert_id)}
                className={`w-full text-left p-4 cursor-pointer transition-colors ${
                  selected?.evidence_id === pack.evidence_id ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                }`}
              >
                <div className="text-sm font-semibold text-slate-900 truncate">
                  {pack.caller_label}
                </div>
                <div className="text-xs text-slate-500 font-mono tabular-nums mt-1">
                  {pack.evidence_id} · {pack.rule_verdict} ({pack.risk_score}/100)
                </div>
              </button>
            ))}
          </div>

          {/* Selected Evidence Pack */}
          {selected && (
            <div className="lg:col-span-8 space-y-6">
              <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                <div className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-orange-950">
                    <FileWarning className="w-4 h-4 text-orange-700 shrink-0" />
                    <span>{selected.submission_status}</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      Evidence Pack {selected.evidence_id}
                    </h2>
                    <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                      Alert {selected.alert_id} · Rule Verdict: {selected.rule_verdict} (
                      {selected.risk_score}/100)
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`/api/evidence/${selected.alert_id}/download?format=json`}
                      download={`suraksha-evidence-${selected.alert_id}.json`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download JSON</span>
                    </a>
                    <a
                      href={`/api/evidence/${selected.alert_id}/download?format=html`}
                      download={`suraksha-evidence-${selected.alert_id}.html`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Printable Report</span>
                    </a>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500">Caller:</span>{' '}
                    <strong className="text-slate-900">{selected.caller_label}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Playbook:</span>{' '}
                    <strong className="text-slate-900">
                      {selected.matched_playbook?.title || 'Multi-Signal Pattern'}
                    </strong>
                  </div>
                  <div className="sm:col-span-2 font-mono text-slate-600 break-all">
                    Integrity Hash: {selected.audit_integrity_hash}
                  </div>
                </div>

                {/* Transcript Excerpts */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-700 mb-2">
                    Preserved Transcript Excerpts
                  </h3>
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
                    {selected.transcript_excerpts.map((seg) => (
                      <div key={seg.id} className="p-3 flex items-start justify-between gap-3">
                        <div>
                          <span className="font-semibold text-slate-800">{seg.speaker}: </span>
                          <span className="text-slate-700">{seg.text}</span>
                        </div>
                        <span className="font-mono text-slate-400 shrink-0 tabular-nums">
                          {new Date(seg.timestamp_ms).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Manual Reporting Instructions */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-700 mb-2">
                    Manual Family Reporting Channels (No Automatic Submission)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {selected.manual_reporting_channels.map((ch) => (
                      <div key={ch.channel} className="border border-slate-200 rounded-lg p-3.5 text-xs min-w-0">
                        <div className="font-semibold text-slate-900">{ch.channel}</div>
                        <div className="font-mono text-blue-700 mt-0.5 break-all">{ch.target}</div>
                        <p className="text-slate-600 mt-1.5">{ch.instructions}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      )}

      {/* Full Hash-Chained Audit Ledger */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">
          Append-Only Hash-Chained Audit Ledger ({auditEvents.length} events)
        </h2>
        {auditEvents.length === 0 ? (
          <p className="text-xs text-slate-500">No audit events logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3">Seq</th>
                  <th className="py-2 pr-3">Alert ID</th>
                  <th className="py-2 pr-3">Event Type</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Outcome</th>
                  <th className="py-2 pr-3">Previous Hash</th>
                  <th className="py-2">Event Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                {auditEvents.slice(0, 20).map((ev) => (
                  <tr key={ev.event_id}>
                    <td className="py-2 pr-3">#{ev.seq}</td>
                    <td className="py-2 pr-3">{ev.alert_id}</td>
                    <td className="py-2 pr-3 font-sans font-medium">{ev.event_type}</td>
                    <td className="py-2 pr-3 font-sans">{ev.action}</td>
                    <td
                      className={`py-2 pr-3 font-semibold ${
                        ev.outcome === 'DENIED' ? 'text-red-600' : 'text-emerald-700'
                      }`}
                    >
                      {ev.outcome}
                    </td>
                    <td className="py-2 pr-3 text-slate-400">
                      {ev.previous_event_hash.slice(0, 12)}…
                    </td>
                    <td className="py-2 text-slate-700">{ev.event_hash.slice(0, 12)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
