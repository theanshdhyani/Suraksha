import { useEffect, useState } from 'react';
import { Bell, FileText, ShieldAlert, ShieldX } from 'lucide-react';
import { api } from '../api/client';
import type { AuditEvent, ScamAlert } from '../core/types';
import type { NavPage } from './ProtectionDashboard';

interface GuardianDashboardProps {
  onNavigate: (page: NavPage) => void;
}

export function GuardianDashboard({ onNavigate }: GuardianDashboardProps) {
  const [alerts, setAlerts] = useState<ScamAlert[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [alertRes, auditRes] = await Promise.all([api.getAlerts(), api.getAudit()]);
      setAlerts(alertRes.alerts);
      setAuditEvents(auditRes.events);
      if (alertRes.alerts.length > 0 && !selectedId) {
        setSelectedId(alertRes.alerts[0].alert_id);
      }
    } catch {
      // Errors surface via App banner or empty state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const selected = alerts.find((a) => a.alert_id === selectedId) || alerts[0] || null;
  const relatedAudit = selected
    ? auditEvents.filter((e) => e.alert_id === selected.alert_id)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Guardian Dashboard</h1>
          <p className="text-xs text-slate-500 mt-1">
            Incident oversight for Ansh · Risk classification, parental approval state, SNS
            notifications, and audit trace
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          Refresh Incidents
        </button>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-xs text-slate-500">
          Loading guardian incidents…
        </div>
      ) : alerts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
          <p className="text-sm font-semibold text-slate-800">No active guardian incidents</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Run a scam call simulation in Live Guard and approve with &ldquo;haan&rdquo; to inspect
            incident telemetry, SNS delivery, and audit trails here.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('live-guard')}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer"
          >
            Go to Live Guard
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Incident List */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {alerts.map((a) => (
              <button
                key={a.alert_id}
                type="button"
                onClick={() => setSelectedId(a.alert_id)}
                className={`w-full text-left p-4 transition-colors cursor-pointer ${
                  selected?.alert_id === a.alert_id ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-900 truncate">{a.caller_label}</span>
                  <span className="font-mono text-red-600 tabular-nums shrink-0">
                    {a.evaluation.score}/100
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                  {a.alert_id} · {a.lifecycle_state}
                </div>
              </button>
            ))}
          </div>

          {/* Selected Incident Detail */}
          {selected && (
            <div className="lg:col-span-8 space-y-6">
              <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-red-700">
                      <ShieldAlert className="w-4 h-4" />
                      <span>
                        {selected.evaluation.risk_level} · {selected.lifecycle_state}
                      </span>
                    </div>
                    <h2 className="text-lg font-semibold text-slate-900 mt-1">
                      {selected.caller_label}
                    </h2>
                    <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                      Alert {selected.alert_id} · Approval: {selected.approval_status} · Evidence:{' '}
                      {selected.evidence_id ? selected.evidence_id : 'Pending'}
                    </p>
                  </div>
                  {selected.evidence_id && (
                    <button
                      type="button"
                      onClick={() => onNavigate('evidence')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>View Evidence Pack</span>
                    </button>
                  )}
                </div>

                {/* Matched Indicators */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-700 mb-2">
                    Detected Scam Indicators
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {selected.evaluation.matches.map((m) => (
                      <div
                        key={m.rule_id}
                        className="border border-slate-200 rounded-lg p-3 text-xs bg-slate-50"
                      >
                        <div className="font-semibold text-slate-900">
                          {m.category} (+{m.weight})
                        </div>
                        <div className="text-slate-600 mt-0.5">{m.label}</div>
                        <div className="font-mono text-slate-500 mt-1">
                          &ldquo;{m.matched_phrase}&rdquo;
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Guardian SNS Notifications */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-700 mb-2">
                    Guardian Notifications (Amazon SNS)
                  </h3>
                  {selected.notifications.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No guardian notifications sent (parental &ldquo;haan&rdquo; approval not yet
                      completed).
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {selected.notifications.map((n) => (
                        <div
                          key={n.notification_id}
                          className="border border-emerald-200 bg-emerald-50/60 rounded-lg p-3.5 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between font-semibold text-emerald-900">
                            <span className="inline-flex items-center gap-1.5">
                              <Bell className="w-3.5 h-3.5" />
                              {n.subject}
                            </span>
                            <span className="font-mono">{n.delivery_status}</span>
                          </div>
                          <pre className="whitespace-pre-wrap font-sans text-slate-700 text-xs">
                            {n.message}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Denied Attempts */}
                {selected.denied_attempts.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-red-700 mb-2">
                      Blocked Unauthorized Policy Attempts
                    </h3>
                    <div className="space-y-2">
                      {selected.denied_attempts.map((d, idx) => (
                        <div
                          key={idx}
                          className="border border-red-200 bg-red-50 rounded-lg p-3 text-xs flex items-start gap-2"
                        >
                          <ShieldX className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-semibold text-red-900">
                              DENIED: {d.action} ({d.code})
                            </div>
                            <div className="text-red-800">{d.reason}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* Alert Audit Events */}
              <section className="bg-white border border-slate-200 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">
                  Hash-Chained Audit Trail ({relatedAudit.length} events)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-2 whitespace-nowrap">Seq</th>
                        <th className="py-2 pr-2 whitespace-nowrap">Type</th>
                        <th className="py-2 pr-2">Actor</th>
                        <th className="py-2 pr-2">Action</th>
                        <th className="py-2 pr-2 whitespace-nowrap">Outcome</th>
                        <th className="py-2 whitespace-nowrap">Event Hash</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                      {relatedAudit.map((ev) => (
                        <tr key={ev.event_id}>
                          <td className="py-2 pr-2 whitespace-nowrap">#{ev.seq}</td>
                          <td className="py-2 pr-2 font-sans font-medium text-slate-800 whitespace-nowrap">
                            {ev.event_type}
                          </td>
                          <td
                            className="py-2 pr-2 font-sans text-slate-600 max-w-[140px] truncate"
                            title={ev.actor}
                          >
                            {ev.actor}
                          </td>
                          <td
                            className="py-2 pr-2 font-sans text-slate-600 max-w-[175px] truncate"
                            title={ev.action}
                          >
                            {ev.action}
                          </td>
                          <td
                            className={`py-2 pr-2 font-semibold whitespace-nowrap ${
                              ev.outcome === 'DENIED' ? 'text-red-600' : 'text-emerald-700'
                            }`}
                          >
                            {ev.outcome}
                          </td>
                          <td className="py-2 text-slate-500 whitespace-nowrap" title={ev.event_hash}>
                            {ev.event_hash.slice(0, 12)}…
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
