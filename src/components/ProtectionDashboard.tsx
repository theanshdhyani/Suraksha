import { ArrowRight, CheckCircle2, FileCheck2, ShieldCheck, Smartphone, Users } from 'lucide-react';
import type { DashboardSummary } from '../api/client';

export type NavPage =
  | 'home'
  | 'live-guard'
  | 'guardian'
  | 'architecture'
  | 'evidence'
  | 'scam-drill'
  | 'integrations';

interface ProtectionDashboardProps {
  summary: DashboardSummary | null;
  loading: boolean;
  onNavigate: (page: NavPage) => void;
}

export function ProtectionDashboard({ summary, loading, onNavigate }: ProtectionDashboardProps) {
  return (
    <div className="space-y-8">
      {/* Hero Summary Panel */}
      <section className="bg-white border border-slate-200 rounded-xl p-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs font-medium tracking-wide text-slate-500">
              SURAKSHA Family Guardian · Live-Call Isolation Breaker
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 text-balance">
              Real-time scam call protection with explicit parental approval
            </h1>
            <p className="text-sm leading-relaxed text-slate-600">
              Monitors authorized call audio via rolling 18-second deterministic rules, plays a
              pre-consented family voice prompt to break scammer isolation, and unlocks family
              escalation only after the parent explicitly says &ldquo;haan&rdquo;. Never converses
              with the suspected scammer.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('live-guard')}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Start Live Guard</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('architecture')}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              View Architecture
            </button>
          </div>
        </div>
      </section>

      {/* Primary Status Strip (4 equal-height KPIs) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Protection Status</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <div className="text-2xl font-semibold text-slate-900">
              {loading ? 'Checking…' : summary?.protection_active ? 'Active' : 'Standby'}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Rule Engine v2026.1.0 · Deterministic
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Parent Device &amp; Monitoring</span>
            <Smartphone className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <div className="text-2xl font-semibold text-slate-900">
              {summary?.parent_device_connected ? 'Connected' : 'Ready'}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Audio stream · Echo suppression armed
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Alerts &amp; High-Risk Incidents</span>
            <FileCheck2 className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <div className="text-2xl font-semibold text-slate-900 tabular-nums font-mono">
              {summary?.high_risk_incidents ?? 0} High-Risk
            </div>
            <p className="text-xs text-slate-500 mt-1 tabular-nums">
              {summary?.total_alerts ?? 0} total alerts · {summary?.evidence_packs_ready ?? 0} evidence packs
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Guardian Connection</span>
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <div className="text-2xl font-semibold text-slate-900">
              {summary?.guardian_name || 'Ansh'} · Linked
            </div>
            <p className="text-xs text-slate-500 mt-1">
              SNS channel · Consented voice verified
            </p>
          </div>
        </div>
      </section>

      {/* Recent Activity & Safeguard Verification */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        <section className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Recent Incident Activity</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Live alerts, policy evaluations, and guardian escalations
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('guardian')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer whitespace-nowrap"
            >
              Open Guardian Dashboard
            </button>
          </div>

          {!summary || summary.recent_alerts.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <p className="text-sm font-medium text-slate-700">No scam calls recorded yet</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Launch a simulated Digital Arrest, Bank KYC, or TRAI AnyDesk call in Live Guard to
                watch progressive transcription, deterministic detection, and policy-enforced
                approval in action.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('live-guard')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 cursor-pointer"
              >
                Start Live Guard Simulation
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 mt-2">
              {summary.recent_alerts.map((alert) => (
                <div key={alert.alert_id} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {alert.caller_label}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5 font-mono tabular-nums">
                      <span>{alert.alert_id}</span>
                      <span aria-hidden="true">·</span>
                      <span>Score {alert.evaluation.score}/100</span>
                      <span aria-hidden="true">·</span>
                      <span>{alert.evaluation.categories_detected.join(', ')}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`text-xs font-semibold ${
                        alert.lifecycle_state === 'DENIED'
                          ? 'text-red-600'
                          : alert.lifecycle_state === 'EVIDENCE_READY' ||
                              alert.lifecycle_state === 'FAMILY_ALERTED'
                            ? 'text-emerald-700'
                            : 'text-amber-700'
                      }`}
                    >
                      {alert.lifecycle_state}
                    </span>
                    <div className="text-xs text-slate-400 font-mono tabular-nums mt-0.5">
                      {new Date(alert.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 pb-4 border-b border-slate-100">
              Non-Negotiable Safety Guardrails
            </h2>
            <ul className="mt-4 space-y-3 text-xs text-slate-600">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>System never replies to or converses with the suspected scammer.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Tier 2 Family MCP remains locked until parent explicitly says &ldquo;haan&rdquo;.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Cedar Policy + Lambda Interceptor enforce default-deny &amp; forbid-wins outside
                  the LLM.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Audit Chain Integrity:{' '}
                  <strong className="text-slate-900 font-mono tabular-nums">
                    {loading || !summary
                      ? 'VERIFYING…'
                      : `${summary.audit_chain_valid ? 'VERIFIED' : 'CHECK REQUIRED'} (${summary.audit_total_events} events)`}
                  </strong>
                </span>
              </li>
            </ul>
          </div>

          <div className="pt-4 mt-6 border-t border-slate-100 flex items-center justify-between gap-3 text-xs text-slate-500">
            <span>Manual reporting only (Chakshu / 1930)</span>
            <button
              type="button"
              onClick={() => onNavigate('evidence')}
              className="text-blue-600 font-medium hover:text-blue-700 cursor-pointer whitespace-nowrap shrink-0"
            >
              Evidence Center
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
