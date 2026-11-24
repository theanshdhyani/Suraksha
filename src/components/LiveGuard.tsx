import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  Mic,
  MicOff,
  PhoneCall,
  Play,
  ShieldAlert,
  ShieldX,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { api } from '../api/client';
import type {
  CallSession,
  RuleEngineEvaluation,
  ScamAlert,
  ScenarioDefinition,
  TranscriptSegment,
} from '../core/types';
import type { GatewayInvokeResponse } from '../mcp/gatewayRouter';
import type { TextToSpeechResult } from '../providers/interfaces';
import type { NavPage } from './ProtectionDashboard';

interface LiveGuardProps {
  onDataUpdated: () => void;
  onNavigate: (page: NavPage) => void;
}

export function LiveGuard({ onDataUpdated, onNavigate }: LiveGuardProps) {
  const [scenarios, setScenarios] = useState<ScenarioDefinition[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('cbi_digital_arrest');
  const [session, setSession] = useState<CallSession | null>(null);
  const [evaluation, setEvaluation] = useState<RuleEngineEvaluation | null>(null);
  const [alert, setAlert] = useState<ScamAlert | null>(null);
  const [ttsResult, setTtsResult] = useState<TextToSpeechResult | null>(null);
  const [approvalToken, setApprovalToken] = useState<Record<string, unknown> | null>(null);
  const [gatewayResult, setGatewayResult] = useState<GatewayInvokeResponse | null>(null);
  const [blockedDemoResult, setBlockedDemoResult] = useState<GatewayInvokeResponse | null>(null);
  const [customUtterance, setCustomUtterance] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isListeningMic, setIsListeningMic] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const timerRefs = useRef<number[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    void api
      .getScenarios()
      .then((data) => {
        setScenarios(data.scenarios);
        if (data.scenarios.length > 0) {
          setSelectedScenarioId(data.scenarios[0].id);
        }
      })
      .catch((err) => {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load call scenarios.');
      });
    return () => {
      timerRefs.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const clearTimers = () => {
    timerRefs.current.forEach((id) => window.clearTimeout(id));
    timerRefs.current = [];
  };

  const playConsentedVoiceInterruption = (tts: TextToSpeechResult) => {
    setTtsResult(tts);
    try {
      if (tts.audio_url) {
        const audio = new Audio(tts.audio_url);
        audioRef.current = audio;
        void audio.play().catch(() => {});
      }
      if (tts.browser_speech_fallback && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(tts.prompt_text);
        utter.lang = 'hi-IN';
        utter.rate = 0.96;
        window.speechSynthesis.speak(utter);
      }
    } catch {
      // Audio playback is optional in headless environments
    }
  };

  const startCallSimulation = async () => {
    clearTimers();
    setErrorMessage(null);
    setStatusMessage('Initializing call monitoring session and ElevenLabs Scribe adapter…');
    setEvaluation(null);
    setAlert(null);
    setTtsResult(null);
    setApprovalToken(null);
    setGatewayResult(null);
    setBlockedDemoResult(null);

    const scenario = scenarios.find((s) => s.id === selectedScenarioId) || scenarios[0];
    if (!scenario) return;

    try {
      const { session: created } = await api.startSession({
        scenario_id: scenario.id,
        parent_name: 'Maa / Papa',
        guardian_name: 'Ansh',
      });
      setSession(created);
      setIsStreaming(true);
      setStatusMessage(`Monitoring active call: ${scenario.caller_label}`);

      let cumulativeDelay = 400;
      const baseEpoch = Date.now();

      scenario.segments.forEach((seg, idx) => {
        cumulativeDelay += seg.delay_ms;
        const timerId = window.setTimeout(async () => {
          try {
            const res = await api.ingestTranscript(created.session_id, {
              speaker: seg.speaker,
              text: seg.text,
              language: seg.language,
              timestamp_ms: baseEpoch + idx * 2500,
            });
            setSession(res.session);
            setEvaluation(res.evaluation);

            if (res.alert) {
              setAlert(res.alert);
              if (res.tts_interruption) {
                playConsentedVoiceInterruption(res.tts_interruption);
              }
              setStatusMessage(
                'High-risk scam detected! Consented family prompt played. Waiting for parent explicit "haan".'
              );
              onDataUpdated();
            } else if (res.active_alert) {
              setAlert(res.active_alert);
            }

            if (idx === scenario.segments.length - 1) {
              setIsStreaming(false);
              if (!res.alert && !res.active_alert) {
                setStatusMessage('Call simulation complete — No scam indicators triggered.');
              }
              onDataUpdated();
            }
          } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : 'Streaming error');
            setIsStreaming(false);
          }
        }, cumulativeDelay);
        timerRefs.current.push(timerId);
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to start call simulation');
      setIsStreaming(false);
    }
  };

  const stopCallSimulation = () => {
    clearTimers();
    setIsStreaming(false);
    setStatusMessage('Call simulation stopped.');
  };

  const handleParentDecision = async (utterance: string) => {
    if (!alert) return;
    setErrorMessage(null);
    try {
      const res = await api.submitApproval(alert.alert_id, utterance);
      setAlert(res.alert);
      if (res.token) setApprovalToken(res.token);
      if (res.gateway_result) setGatewayResult(res.gateway_result);
      if (!res.approved && res.error) {
        setStatusMessage(res.error);
      } else if (res.approved) {
        clearTimers();
        setIsStreaming(false);
        setStatusMessage(
          'Explicit "haan" verified. Signed token authorized Family MCP via AgentCore Gateway. Guardian Ansh alerted & Evidence Pack ready.'
        );
      }
      onDataUpdated();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Approval submission failed');
    }
  };

  const handleTestBlockedAction = async (
    scenario: 'MISSING_TOKEN' | 'LLM_OVERRIDE' | 'REUSED_TOKEN' | 'FORBIDDEN_SCAMMER_REPLY'
  ) => {
    const targetAlertId = alert?.alert_id || 'alt_demo_unapproved';
    setErrorMessage(null);
    try {
      const res = await api.testUnauthorizedGateway(targetAlertId, scenario);
      setBlockedDemoResult(res);
      if (alert) {
        const refreshed = await api.getAlerts();
        const updated = refreshed.alerts.find((a) => a.alert_id === alert.alert_id);
        if (updated) setAlert(updated);
      }
      onDataUpdated();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Policy check failed');
    }
  };

  const handleSpeechRecognitionForHaan = () => {
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (!SpeechRec) {
      setErrorMessage(
        'Browser SpeechRecognition is unavailable in this headless/browser environment. Use the explicit "Haan" or custom utterance input below.'
      );
      return;
    }

    try {
      const rec = new (SpeechRec as new () => {
        lang: string;
        interimResults: boolean;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
      })();
      rec.lang = 'hi-IN';
      rec.interimResults = false;
      setIsListeningMic(true);
      rec.onresult = (event) => {
        const spoken = event.results[0]?.[0]?.transcript || '';
        setIsListeningMic(false);
        setCustomUtterance(spoken);
        if (alert) {
          void handleParentDecision(spoken);
        }
      };
      rec.onerror = () => setIsListeningMic(false);
      rec.onend = () => setIsListeningMic(false);
      rec.start();
    } catch {
      setIsListeningMic(false);
    }
  };

  const activeScenario = scenarios.find((s) => s.id === selectedScenarioId);
  const windowCutoff =
    session && session.transcript.length > 0
      ? Math.max(...session.transcript.map((s) => s.timestamp_ms)) - 18000
      : 0;

  return (
    <div className="space-y-6">
      {/* Control Bar */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="flex-1 space-y-2">
            <label
              htmlFor="scenario-select"
              className="block text-xs font-semibold text-slate-700"
            >
              Select Predefined Call Scenario (Hindi / Hinglish / English)
            </label>
            <select
              id="scenario-select"
              value={selectedScenarioId}
              onChange={(e) => {
                setSelectedScenarioId(e.target.value);
                setSession(null);
                setEvaluation(null);
                setAlert(null);
                setTtsResult(null);
                setApprovalToken(null);
                setGatewayResult(null);
                setBlockedDemoResult(null);
                setStatusMessage(null);
                setErrorMessage(null);
              }}
              disabled={isStreaming}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} — Expected: {s.expected_risk}
                </option>
              ))}
            </select>
            {activeScenario && (
              <p className="text-xs text-slate-500">{activeScenario.summary}</p>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {!isStreaming ? (
              <button
                type="button"
                onClick={startCallSimulation}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Play className="w-4 h-4" />
                <span>Start Call Simulation</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={stopCallSimulation}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Square className="w-4 h-4" />
                <span>Stop Stream</span>
              </button>
            )}
          </div>
        </div>

        {(statusMessage || errorMessage) && (
          <div
            className={`mt-4 px-4 py-2.5 rounded-lg text-xs font-medium border ${
              errorMessage
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            {errorMessage || statusMessage}
          </div>
        )}
      </section>

      {/* Immediate High-Risk Alert & Consented Interruption Hero Banner */}
      {alert && (
        <section
          aria-live="assertive"
          className={`rounded-xl border p-6 space-y-5 ${
            alert.lifecycle_state === 'DENIED' || alert.lifecycle_state === 'REJECTED'
              ? 'bg-red-50 border-red-300'
              : alert.lifecycle_state === 'EVIDENCE_READY' ||
                  alert.lifecycle_state === 'FAMILY_ALERTED'
                ? 'bg-emerald-50 border-emerald-300'
                : 'bg-amber-50 border-amber-300'
          }`}
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div
                className={`flex items-center gap-2 text-xs font-semibold ${
                  alert.lifecycle_state === 'DENIED' || alert.lifecycle_state === 'REJECTED'
                    ? 'text-red-900'
                    : alert.lifecycle_state === 'EVIDENCE_READY' ||
                        alert.lifecycle_state === 'FAMILY_ALERTED'
                      ? 'text-emerald-900'
                      : 'text-amber-900'
                }`}
              >
                <ShieldAlert
                  className={`w-4 h-4 ${
                    alert.lifecycle_state === 'EVIDENCE_READY' ||
                    alert.lifecycle_state === 'FAMILY_ALERTED'
                      ? 'text-emerald-700'
                      : 'text-red-600'
                  }`}
                />
                <span>
                  IMMEDIATE RULE ENGINE ALERT · {alert.evaluation.risk_level} RISK (
                  {alert.evaluation.score}/100) · {alert.lifecycle_state}
                </span>
              </div>
              <h2 className="text-xl font-semibold text-slate-900">
                Consented Family Voice Prompt: &ldquo;{alert.interruption_prompt}&rdquo;
              </h2>
              <p className="text-xs text-slate-700">
                Triggered deterministically in{' '}
                <span className="font-mono tabular-nums">
                  {alert.evaluation.evaluation_latency_ms}ms
                </span>{' '}
                without waiting for Bedrock · Echo suppression{' '}
                {session?.echo_suppression_active ? 'ACTIVE (system voice muted from STT)' : 'RESUMED'}{' '}
                · Scammer reply strictly blocked
              </p>
            </div>

            {ttsResult && (
              <button
                type="button"
                onClick={() => playConsentedVoiceInterruption(ttsResult)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-800 text-xs font-semibold hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Volume2 className="w-4 h-4 text-blue-600" />
                <span>Replay Consented Prompt</span>
              </button>
            )}
          </div>

          {/* Explicit Parental Approval Controls */}
          {alert.approval_status !== 'APPROVED' && (
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              {alert.approval_status === 'REJECTED' && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-900 font-medium">
                  Parental confirmation was declined or ambiguous. Family MCP tools remain locked
                  and no guardian notification was sent. Say explicit &ldquo;haan&rdquo; below to
                  authorize family alert.
                </div>
              )}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Waiting for Explicit Parental Confirmation
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Family MCP tools are locked. Only explicit &ldquo;haan&rdquo; generates a
                    single-use signed token for Alert <code className="font-mono">{alert.alert_id}</code>.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleParentDecision('haan')}
                    className="px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Say &ldquo;Haan&rdquo; (Approve Family Alert)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleParentDecision('nahi')}
                    className="px-4 py-2.5 rounded-lg bg-slate-200 text-slate-800 text-xs font-semibold hover:bg-slate-300 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Say &ldquo;Nahi&rdquo; (Decline)
                  </button>
                  <button
                    type="button"
                    onClick={handleSpeechRecognitionForHaan}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                  >
                    {isListeningMic ? <MicOff className="w-3.5 h-3.5 text-red-600" /> : <Mic className="w-3.5 h-3.5" />}
                    <span>{isListeningMic ? 'Listening…' : 'Speak "Haan"'}</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-slate-100">
                <input
                  type="text"
                  aria-label="Test parent spoken response"
                  value={customUtterance}
                  onChange={(e) => setCustomUtterance(e.target.value)}
                  placeholder='Test ambiguous utterance (e.g. "theek hai") or explicit "haan"'
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button
                  type="button"
                  onClick={() => customUtterance.trim() && handleParentDecision(customUtterance)}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                >
                  Submit Utterance
                </button>
              </div>
            </div>
          )}

          {/* Approved & Executed Trace */}
          {approvalToken && gatewayResult && (
            <div className="bg-white border border-emerald-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <div className="font-semibold text-slate-900">1. Cryptographic Approval Token</div>
                <div className="font-mono text-slate-600 mt-1 space-y-0.5 tabular-nums">
                  <div>id: {String(approvalToken.token_id)}</div>
                  <div>alert: {String(approvalToken.alert_id)}</div>
                  <div>status: {String(approvalToken.usage_status)} (Single-Use)</div>
                </div>
              </div>
              <div>
                <div className="font-semibold text-slate-900">2. Gateway &amp; Cedar Enforcement</div>
                <div className="text-slate-600 mt-1 space-y-0.5">
                  <div>
                    Decision:{' '}
                    <strong className="text-emerald-700">{gatewayResult.cedar_decision.decision}</strong>{' '}
                    ({gatewayResult.cedar_decision.matched_policy_id})
                  </div>
                  <div>Interceptor: {gatewayResult.interceptor_validation?.code}</div>
                </div>
              </div>
              <div>
                <div className="font-semibold text-slate-900">3. Family Notification &amp; Evidence</div>
                <div className="text-slate-600 mt-1 space-y-1">
                  <div>
                    Ansh notified via{' '}
                    {alert.notifications[0]?.delivery_status || 'SIMULATED_DELIVERED'}
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('evidence')}
                    className="text-blue-600 font-semibold hover:text-blue-700 cursor-pointer"
                  >
                    Open Evidence Pack ({alert.evidence_id})
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Main Split: Live Transcript vs Rule Engine & Security Trace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 cols: Incoming Caller + Progressive Transcript */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
                <PhoneCall className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {session ? session.caller_label : 'Incoming Call Monitor Standby'}
                </h2>
                <p className="text-xs text-slate-500">
                  {session
                    ? `Session ${session.session_id} · Rolling Window: 18s · STT: Scribe v2 Adapter`
                    : 'Choose a scenario above and start simulation to stream transcript segments'}
                </p>
              </div>
            </div>
            <div className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
              {session?.echo_suppression_active ? (
                <>
                  <VolumeX className="w-4 h-4 text-amber-600" />
                  <span>Echo Suppressed</span>
                </>
              ) : (
                <span>{isStreaming ? 'Streaming Audio' : session ? session.status : 'Idle'}</span>
              )}
            </div>
          </div>

          {/* Transcript Feed */}
          <div className="space-y-3 min-h-[280px] max-h-[440px] overflow-y-auto pr-1">
            {!session || session.transcript.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-400">
                Progressive transcript segments will appear here with timestamps as speech arrives.
              </div>
            ) : (
              session.transcript.map((seg: TranscriptSegment) => {
                const inWindow = seg.timestamp_ms >= windowCutoff;
                return (
                  <div
                    key={seg.id}
                    className={`rounded-lg border p-3.5 text-sm ${
                      seg.suppressed_echo
                        ? 'bg-slate-50 border-slate-200 opacity-60'
                        : seg.speaker === 'PARENT'
                          ? 'bg-blue-50/60 border-blue-200'
                          : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span className="font-semibold text-slate-700">
                        {seg.speaker === 'SYSTEM_SUPPRESSED'
                          ? 'SYSTEM ECHO SUPPRESSED'
                          : seg.speaker === 'PARENT'
                            ? 'PARENT (Device Mic)'
                            : 'CALLER (Incoming Stream)'}
                      </span>
                      <span className="font-mono tabular-nums">
                        {new Date(seg.timestamp_ms).toLocaleTimeString()} ·{' '}
                        {inWindow ? 'In 18s Window' : 'Aged Out'}
                      </span>
                    </div>
                    <p className="text-slate-900 leading-relaxed">{seg.text}</p>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Right 5 cols: Deterministic Rule Engine, Bedrock Explanation & Policy Enforcement */}
        <section className="lg:col-span-5 space-y-6">
          {/* Deterministic Rule Engine */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Deterministic Rule Engine
                </h2>
                <p className="text-xs text-slate-500">
                  Zero LLM dependency · Threshold 55/100
                </p>
              </div>
              <div className="text-right font-mono tabular-nums">
                <div
                  className={`text-2xl font-bold ${
                    (evaluation?.score ?? 0) >= 55
                      ? 'text-red-600'
                      : (evaluation?.score ?? 0) >= 25
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                  }`}
                >
                  {evaluation ? `${evaluation.score}/100` : '0/100'}
                </div>
                <div className="text-xs font-semibold text-slate-600">
                  {evaluation?.risk_level ?? 'LOW'}
                </div>
              </div>
            </div>

            {evaluation && evaluation.matches.length > 0 ? (
              <div className="space-y-2.5">
                <div className="text-xs text-slate-600">
                  Categories:{' '}
                  <span className="font-semibold text-slate-900">
                    {evaluation.categories_detected.join(' · ')}
                  </span>
                </div>
                <ul className="space-y-2">
                  {evaluation.matches.map((m) => (
                    <li
                      key={m.rule_id}
                      className="rounded-lg bg-amber-50/70 border border-amber-200 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center justify-between font-semibold text-amber-900">
                        <span>{m.category}</span>
                        <span className="font-mono tabular-nums">+{m.weight}</span>
                      </div>
                      <div className="text-slate-700 mt-0.5">{m.label}</div>
                      <div className="font-mono text-slate-500 mt-0.5">
                        Matched: &ldquo;{m.matched_phrase}&rdquo;
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                No multi-signal scam indicators matched in the current rolling window.
              </p>
            )}
          </div>

          {/* Amazon Bedrock Independent Explanation */}
          {alert?.explanation && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-900">
                  Amazon Bedrock Explanation (Advisory Only)
                </h3>
                <span className="text-xs font-mono text-slate-500">{alert.explanation.mode}</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                {alert.explanation.family_risk_summary}
              </p>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-800">
                <div className="font-semibold text-slate-900 mb-1">Hindi / Hinglish Summary</div>
                <p>{alert.explanation.hindi_explanation}</p>
              </div>
              <div className="text-xs text-slate-600">
                <strong>Guardian Script:</strong> {alert.explanation.suggested_guardian_script}
              </div>
            </div>
          )}

          {/* Policy Enforcement & Blocked Action Demo */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Lock className="w-4 h-4 text-red-600" />
              <h3 className="text-sm font-semibold text-slate-900">
                Policy Enforcement &amp; Blocked Action Demo
              </h3>
            </div>
            <p className="text-xs text-slate-600">
              Verify AgentCore Gateway + Lambda Interceptor + Cedar Policy block unauthorized Tier 2
              calls and record denials in the hash-chained Audit Log.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleTestBlockedAction('MISSING_TOKEN')}
                className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-800 text-xs font-medium hover:bg-red-100 cursor-pointer text-left"
              >
                Block Missing Token
              </button>
              <button
                type="button"
                onClick={() => handleTestBlockedAction('LLM_OVERRIDE')}
                className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-800 text-xs font-medium hover:bg-red-100 cursor-pointer text-left"
              >
                Block LLM Override
              </button>
              <button
                type="button"
                onClick={() => handleTestBlockedAction('REUSED_TOKEN')}
                className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-800 text-xs font-medium hover:bg-red-100 cursor-pointer text-left"
              >
                Block Token Replay
              </button>
              <button
                type="button"
                onClick={() => handleTestBlockedAction('FORBIDDEN_SCAMMER_REPLY')}
                className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-800 text-xs font-medium hover:bg-red-100 cursor-pointer text-left"
              >
                Block Scammer Reply
              </button>
            </div>

            {blockedDemoResult && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3.5 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-red-800">
                  <ShieldX className="w-4 h-4" />
                  <span>
                    GATEWAY RESULT: {blockedDemoResult.status} ({blockedDemoResult.cedar_decision.effect})
                  </span>
                </div>
                <div className="text-red-900">{blockedDemoResult.error}</div>
                <div className="font-mono text-red-700">
                  Policy: {blockedDemoResult.cedar_decision.matched_policy_id} · Family MCP NOT
                  invoked
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Alert Lifecycle Timeline */}
      {alert && (
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">
            Alert Event Lifecycle ({alert.alert_id})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {alert.timeline.map((step, i) => (
              <div key={`${step.state}-${i}`} className="border border-slate-200 rounded-lg p-3 text-xs">
                <div className="flex items-center justify-between font-semibold text-slate-900">
                  <span>{step.state}</span>
                  {step.state === 'DENIED' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  )}
                </div>
                <p className="text-slate-600 mt-1">{step.summary}</p>
                <div className="font-mono text-slate-400 mt-1.5 tabular-nums">
                  {new Date(step.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
