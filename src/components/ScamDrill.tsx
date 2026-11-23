import { useEffect, useState } from 'react';
import { Award, CheckCircle2, Link2, RotateCcw, ShieldAlert, XCircle } from 'lucide-react';
import { api } from '../api/client';
import type { DrillScenario } from '../services/scamDrillService';

export function ScamDrill() {
  const [scenarios, setScenarios] = useState<DrillScenario[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [turnIndex, setTurnIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [history, setHistory] = useState<
    Array<{ scammer: string; chosen: string; safe: boolean; feedback: string }>
  >([]);

  // Secondary Message & URL Checker state
  const [messageText, setMessageText] = useState(
    'URGENT SBI Alert: Your KYC is expired and account will be blocked today. Verify immediately at https://sbi-kyc-update-verify.xyz/login or share OTP.'
  );
  const [urlInput, setUrlInput] = useState('https://sbi-kyc-update-verify.xyz/login');
  const [checkResult, setCheckResult] = useState<Awaited<
    ReturnType<typeof api.checkSuspiciousMessage>
  > | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    void api.getDrillScenarios().then((res) => {
      setScenarios(res.scenarios);
      if (res.scenarios.length > 0) {
        setSelectedId(res.scenarios[0].id);
      }
    });
  }, []);

  const currentScenario = scenarios.find((s) => s.id === selectedId) || scenarios[0] || null;
  const completed = currentScenario ? turnIndex >= currentScenario.turns.length : false;
  const currentTurn =
    currentScenario && !completed ? currentScenario.turns[turnIndex] : null;

  const selectScenario = (id: string) => {
    setSelectedId(id);
    setTurnIndex(0);
    setScore(0);
    setHistory([]);
  };

  const handleChoice = (choice: DrillScenario['turns'][0]['choices'][0]) => {
    if (!currentTurn) return;
    setScore((prev) => prev + choice.points);
    setHistory((prev) => [
      ...prev,
      {
        scammer: currentTurn.scammer_line,
        chosen: choice.text,
        safe: choice.is_safe,
        feedback: choice.feedback,
      },
    ]);
    setTurnIndex((prev) => prev + 1);
  };

  const handleRunMessageCheck = async () => {
    if (!messageText.trim() && !urlInput.trim()) return;
    setChecking(true);
    try {
      const res = await api.checkSuspiciousMessage({ messageText, url: urlInput });
      setCheckResult(res);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <p className="text-xs font-semibold text-blue-700">
          Isolated Training Environment · Disconnected from Live-Call Path &amp; Family MCP
        </p>
        <h1 className="text-2xl font-semibold text-slate-900 mt-1">
          Scam Drill &amp; Secondary Message Checker
        </h1>
        <p className="text-xs text-slate-600 mt-1 max-w-2xl">
          Interactive family role-play practice for recognizing fake authority, isolation tactics,
          and urgent payment demands. Conversational practice agents are strictly restricted to
          this training module and never interact with live callers.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Roleplay Drill */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Interactive Role-Play Practice
              </h2>
              <p className="text-xs text-slate-500">
                Choose a scam scenario and practice safe responses
              </p>
            </div>
            <div className="flex items-center gap-2">
              {scenarios.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => selectScenario(s.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border ${
                    selectedId === s.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {s.title.split(':')[0]}
                </button>
              ))}
            </div>
          </div>

          {currentScenario && (
            <div className="space-y-4">
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-xs space-y-1">
                <div className="font-semibold text-slate-900">{currentScenario.title}</div>
                <div className="text-slate-600">Focus: {currentScenario.tactic_focus}</div>
                <div className="text-slate-800 pt-2">
                  <strong>Opening Caller Line:</strong> &ldquo;{currentScenario.opening_line}&rdquo;
                </div>
              </div>

              {/* Prior turns feedback */}
              {history.map((h, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3.5 text-xs space-y-1.5 ${
                    h.safe ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="font-medium text-slate-800">
                    Caller: &ldquo;{h.scammer}&rdquo;
                  </div>
                  <div className="text-slate-700">
                    Your response: &ldquo;{h.chosen}&rdquo;
                  </div>
                  <div className="flex items-start gap-1.5 font-semibold pt-1">
                    {h.safe ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-700 shrink-0" />
                    )}
                    <span className={h.safe ? 'text-emerald-900' : 'text-red-900'}>
                      {h.feedback}
                    </span>
                  </div>
                </div>
              ))}

              {/* Active turn or summary */}
              {currentTurn ? (
                <div className="space-y-3 pt-2">
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-slate-900">
                    <strong>Simulated Caller:</strong> &ldquo;{currentTurn.scammer_line}&rdquo;
                  </div>
                  <div className="space-y-2">
                    {currentTurn.choices.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleChoice(c)}
                        className="w-full text-left p-3.5 rounded-lg border border-slate-300 bg-white hover:bg-blue-50 hover:border-blue-400 text-xs font-medium text-slate-900 transition-colors cursor-pointer"
                      >
                        {c.text}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                completed && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
                        <Award className="w-5 h-5 text-blue-600" />
                        <span>Drill Performance Summary</span>
                      </div>
                      <span className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                        {score} / {currentScenario.turns.length * 50}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700">
                      {score === currentScenario.turns.length * 50
                        ? 'Strong readiness! You recognized isolation tactics, refused credentials/transfers, and involved family immediately.'
                        : 'Review the flagged traps above: never keep calls secret from family, never install remote-access apps, and always hang up to verify.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => selectScenario(currentScenario.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restart Drill</span>
                    </button>
                  </div>
                )
              )}
            </div>
          )}
        </section>

        {/* Right: Secondary Message & Link Checker */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Link2 className="w-4 h-4 text-blue-600" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Secondary SMS / WhatsApp &amp; Link Checker
              </h2>
              <p className="text-xs text-slate-500">
                Offline lexical &amp; reputation inspection — links are NEVER clicked or fetched
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label
                htmlFor="suspicious-msg"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Suspicious SMS / WhatsApp Message
              </label>
              <textarea
                id="suspicious-msg"
                rows={4}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="suspicious-url"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Suspicious URL (Inspected Offline Only)
              </label>
              <input
                id="suspicious-url"
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <button
              type="button"
              onClick={handleRunMessageCheck}
              disabled={checking}
              className="w-full px-4 py-2.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer disabled:opacity-60"
            >
              {checking ? 'Analyzing Offline…' : 'Analyze Message & URL Safely'}
            </button>
          </div>

          {checkResult && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3 text-xs">
              {checkResult.message_analysis && (
                <div>
                  <div className="flex items-center justify-between font-semibold text-slate-900">
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-red-600" />
                      Message Verdict: {checkResult.message_analysis.risk_level}
                    </span>
                    <span className="font-mono tabular-nums">
                      {checkResult.message_analysis.score}/100
                    </span>
                  </div>
                  <p className="text-slate-700 mt-1">{checkResult.message_analysis.explanation}</p>
                </div>
              )}

              {checkResult.url_checks.map((u) => (
                <div key={u.url} className="pt-2 border-t border-slate-200 space-y-1">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="font-mono text-slate-900">{u.normalized_host}</span>
                    <span
                      className={
                        u.verdict === 'MALICIOUS'
                          ? 'text-red-600'
                          : u.verdict === 'SUSPICIOUS'
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                      }
                    >
                      {u.verdict} ({u.risk_score}/100)
                    </span>
                  </div>
                  <ul className="list-disc pl-4 text-slate-600 space-y-0.5">
                    {u.indicators.map((ind) => (
                      <li key={ind}>{ind}</li>
                    ))}
                  </ul>
                  <div className="text-[11px] text-slate-500">
                    Safety Verified: Link never opened or fetched over network.
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
