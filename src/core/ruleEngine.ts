import type {
  RiskLevel,
  RuleEngineEvaluation,
  RuleMatch,
  ScamCategory,
  TranscriptSegment,
} from './types';

export const RULE_ENGINE_VERSION = 'suraksha-rules-2026.1.0';
export const DEFAULT_WINDOW_MS = 18_000;
export const DEFAULT_HIGH_RISK_THRESHOLD = 55;

export interface DetectionRule {
  id: string;
  category: ScamCategory;
  label: string;
  weight: number;
  patterns: RegExp[];
}

export interface RuleEngineConfig {
  windowMs: number;
  highRiskThreshold: number;
  categoryWeights?: Partial<Record<ScamCategory, number>>;
}

export const DEFAULT_DETECTION_RULES: DetectionRule[] = [
  // 1. ISOLATION
  {
    id: 'ISO_NO_FAMILY',
    category: 'ISOLATION',
    label: 'Instructing victim not to inform family or anyone',
    weight: 28,
    patterns: [
      /\b(kisi ko mat batana|ghar walon ko mat batana|parivar ko mat batana|bete ko mat batana|beti ko mat batana|kisi se baat mat karna)\b/i,
      /\b(don'?t tell (anyone|your family|your son|your daughter|anybody)|do not inform family|keep this (secret|confidential)|nobody should know)\b/i,
      /किसी को मत बताना|घर वालों को मत|परिवार को मत|बेटे को मत/,
    ],
  },
  {
    id: 'ISO_STAY_ON_VIDEO_CALL',
    category: 'ISOLATION',
    label: 'Forcing victim to stay isolated on live video or audio call',
    weight: 26,
    patterns: [
      /\b(call mat katna|phone mat kaatna|video call pe raho|camera on rakho|skype|whatsapp video|room band kar lo|akela kamre mein)\b/i,
      /\b(do not disconnect|stay on (this )?(video )?call|keep your camera on|lock the door|stay alone in the room)\b/i,
      /कॉल मत काटना|वीडियो कॉल पर रहो|कैमरा ऑन रखो|कमरा बंद/,
    ],
  },

  // 2. FAKE AUTHORITY
  {
    id: 'AUTH_LAW_ENFORCEMENT',
    category: 'FAKE_AUTHORITY',
    label: 'Impersonating CBI, Police, Crime Branch, Narcotics, or Cyber Cell',
    weight: 24,
    patterns: [
      /\b(cbi|crime branch|mumbai police|delhi police|cyber cell|ncb|enforcement directorate|ed officer|ips officer|dsp|inspector bol raha|thanedar)\b/i,
      /\b(supreme court|high court|magistrate|central bureau of investigation)\b/i,
      /सीबीआई|क्राइम ब्रांच|पुलिस|साइबर सेल|नारकोटिक्स/,
    ],
  },
  {
    id: 'AUTH_REGULATORY_BANK',
    category: 'FAKE_AUTHORITY',
    label: 'Impersonating TRAI, Customs, RBI, FedEx, or Bank Fraud Desk',
    weight: 22,
    patterns: [
      /\b(trai|telecom regulatory|customs department|fedex|dhl|rbi|reserve bank|sbi|hdfc|icici|kyc department|fraud department)\b/i,
      /\b(sim (card )?(block|disconnect|suspend)|parcel (seized|drugs|mdma|illegal)|money laundering)\b/i,
      /ट्राई|कस्टम्स|बैंक से बोल|केवाईसी|सिम बंद/,
    ],
  },

  // 3. THREATS
  {
    id: 'THR_DIGITAL_ARREST',
    category: 'THREATS',
    label: 'Digital arrest or fake warrant / FIR threat',
    weight: 34,
    patterns: [
      /\b(digital arrest|arrest warrant|non[- ]?bailable warrant|fir (darj|registered|file)|giraftar|jail|custody|summons)\b/i,
      /\b(aadhar|pan) (card )?(misused|linked to|laundering|crime)\b/i,
      /डिजिटल अरेस्ट|गिरफ्तारी वारंट|एफआईआर|जेल/,
    ],
  },
  {
    id: 'THR_ACCOUNT_FREEZE',
    category: 'THREATS',
    label: 'Threatening imminent legal prosecution or asset/account seizure',
    weight: 22,
    patterns: [
      /\b(bank account freeze|assets? seized|legal action|prosecution|court hearing|police team bhej rahe)\b/i,
      /खाता फ्रीज|कानूनी कार्रवाई|पुलिस भेज रहे/,
    ],
  },

  // 4. URGENCY
  {
    id: 'URG_ARTIFICIAL_DEADLINE',
    category: 'URGENCY',
    label: 'Artificial deadline or immediate compliance pressure',
    weight: 18,
    patterns: [
      /\b(abhi ke abhi|turant|within \d+ minutes|10 minute|15 minute|2 hours|right now|immediately|last warning|aakhri mauka)\b/i,
      /\b(account (will be )?(blocked|closed|suspended) today|kyc expire)\b/i,
      /अभी के अभी|तुरंत|आखिरी मौका|खाता बंद हो जाएगा/,
    ],
  },

  // 5. MONEY AND CREDENTIAL REQUESTS
  {
    id: 'MON_OTP_PIN',
    category: 'MONEY_CREDENTIALS',
    label: 'Requesting OTP, PIN, CVV, or bank password',
    weight: 36,
    patterns: [
      /\b(otp batao|otp share|otp do|otp bol|6 digit code|4 digit pin|atm pin|upi pin|cvv|mpin|netbanking password)\b/i,
      /\b(tell me (the )?otp|read (out )?(the )?otp|share (your )?(otp|pin|cvv|password)|verify (with )?otp)\b/i,
      /ओटीपी बता|ओटीपी बोल|पिन नंबर|सीवीवी/,
    ],
  },
  {
    id: 'MON_TRANSFER_DEMAND',
    category: 'MONEY_CREDENTIALS',
    label: 'Demanding money transfer, bail deposit, RBI verification fund, or UPI payment',
    weight: 32,
    patterns: [
      /\b(paise bhejo|transfer karo|upi id|rbi verification account|safe custody account|security deposit|bail amount|fine bharo|neft|rtgs|imps)\b/i,
      /\b(transfer money|send (rs|rupees|₹|amount)|pay (fine|deposit|verification fee)|scan (this )?qr)\b/i,
      /पैसे भेजो|ट्रांसफर करो|यूपीआई|जमानत राशि|वेरिफिकेशन अकाउंट/,
    ],
  },

  // 6. REMOTE ACCESS
  {
    id: 'REM_SCREEN_SHARE_APP',
    category: 'REMOTE_ACCESS',
    label: 'Instructing to install remote-access app or share screen',
    weight: 34,
    patterns: [
      /\b(anydesk|teamviewer|quicksupport|rustdesk|ultraviewer|airdroid|screen share|share screen|apk download|link pe click)\b/i,
      /\b(install (this )?app|grant (accessibility|remote) permission|allow remote control)\b/i,
      /एनीडेस्क|टीमव्यूअर|स्क्रीन शेयर|ऐप डाउनलोड/,
    ],
  },
];

export class DeterministicRuleEngine {
  private readonly rules: DetectionRule[];
  private readonly config: RuleEngineConfig;
  private alertedSessions = new Map<string, number>();

  constructor(
    config: Partial<RuleEngineConfig> = {},
    rules: DetectionRule[] = DEFAULT_DETECTION_RULES
  ) {
    this.config = {
      windowMs: config.windowMs ?? DEFAULT_WINDOW_MS,
      highRiskThreshold: config.highRiskThreshold ?? DEFAULT_HIGH_RISK_THRESHOLD,
      categoryWeights: config.categoryWeights ?? {},
    };
    this.rules = rules;
  }

  public evaluateWindow(
    sessionId: string,
    segments: TranscriptSegment[],
    nowMs?: number
  ): RuleEngineEvaluation {
    const startPerf = performance.now();
    const activeSegments = segments.filter(
      (seg) => !seg.suppressed_echo && seg.speaker !== 'SYSTEM_SUPPRESSED'
    );

    const latestTs =
      nowMs ??
      (activeSegments.length > 0
        ? Math.max(...activeSegments.map((s) => s.timestamp_ms))
        : Date.now());
    const windowStart = latestTs - this.config.windowMs;
    const windowSegments = activeSegments.filter(
      (s) => s.timestamp_ms >= windowStart && s.timestamp_ms <= latestTs
    );

    const matches: RuleMatch[] = [];
    const seenRuleIds = new Set<string>();

    for (const seg of windowSegments) {
      // Only caller utterances or full unattributed call audio should be scored;
      // parent saying "haan" or "hello" does not contribute scammer risk.
      if (seg.speaker === 'PARENT') {
        continue;
      }
      for (const rule of this.rules) {
        if (seenRuleIds.has(rule.id)) continue;
        for (const pattern of rule.patterns) {
          const hit = seg.text.match(pattern);
          if (hit) {
            seenRuleIds.add(rule.id);
            const multiplier = this.config.categoryWeights?.[rule.category] ?? 1;
            matches.push({
              rule_id: rule.id,
              category: rule.category,
              label: rule.label,
              weight: Math.round(rule.weight * multiplier),
              matched_phrase: hit[0],
              segment_id: seg.id,
              timestamp_ms: seg.timestamp_ms,
            });
            break;
          }
        }
      }
    }

    const categories = Array.from(new Set(matches.map((m) => m.category)));
    const rawSum = matches.reduce((acc, m) => acc + m.weight, 0);

    // Context & multi-signal requirement:
    // A single keyword/rule match alone cannot cross high-risk threshold (55).
    // Multi-category synergy adds a +12 bonus when 2+ categories co-occur,
    // and +20 when 3+ categories co-occur.
    let synergyBonus = 0;
    if (categories.length === 2) synergyBonus = 12;
    else if (categories.length >= 3) synergyBonus = 20;

    let score = Math.min(100, rawSum + synergyBonus);

    // Guardrail: single-match conversations are capped below high-risk threshold
    // to prevent false alarms on isolated benign mentions (e.g. "bank account").
    if (matches.length <= 1 && score >= this.config.highRiskThreshold) {
      score = this.config.highRiskThreshold - 10;
    }

    const riskLevel = this.classifyRisk(score, categories.length);
    const meetsThreshold =
      score >= this.config.highRiskThreshold &&
      (matches.length >= 2 || categories.length >= 2);

    let deduplicated = false;
    let highRiskTriggered = false;

    if (meetsThreshold) {
      const priorAlertScore = this.alertedSessions.get(sessionId);
      if (priorAlertScore !== undefined && score <= priorAlertScore + 15) {
        deduplicated = true;
        highRiskTriggered = false;
      } else {
        this.alertedSessions.set(sessionId, score);
        highRiskTriggered = true;
      }
    }

    const latencyMs = Math.max(0.1, Number((performance.now() - startPerf).toFixed(2)));
    const verdictSummary = this.buildVerdictSummary(score, riskLevel, categories, matches);

    return {
      rule_version: RULE_ENGINE_VERSION,
      window_start_ms: windowStart,
      window_end_ms: latestTs,
      window_duration_ms: this.config.windowMs,
      segments_evaluated: windowSegments.length,
      score,
      threshold: this.config.highRiskThreshold,
      risk_level: riskLevel,
      high_risk_triggered: highRiskTriggered,
      categories_detected: categories,
      matches,
      deduplicated,
      evaluation_latency_ms: latencyMs,
      verdict_summary: verdictSummary,
    };
  }

  public resetSessionDeduplication(sessionId: string): void {
    this.alertedSessions.delete(sessionId);
  }

  private classifyRisk(score: number, categoryCount: number): RiskLevel {
    if (score >= 80 && categoryCount >= 3) return 'CRITICAL';
    if (score >= this.config.highRiskThreshold) return 'HIGH';
    if (score >= 25) return 'MEDIUM';
    return 'LOW';
  }

  private buildVerdictSummary(
    score: number,
    level: RiskLevel,
    categories: ScamCategory[],
    matches: RuleMatch[]
  ): string {
    if (matches.length === 0) {
      return 'No scam indicators detected in current rolling window.';
    }
    if (level === 'LOW' || level === 'MEDIUM') {
      return `Isolated signal(s) detected (${categories.join(', ')}), score ${score}/100 below intervention threshold.`;
    }
    return `${level} scam risk (${score}/100) across ${categories.length} tactic categories: ${categories.join(', ')}.`;
  }
}
