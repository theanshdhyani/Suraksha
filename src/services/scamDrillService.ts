import { DeterministicRuleEngine } from '../core/ruleEngine';
import { inspectSuspiciousUrlOffline } from '../core/scamIntelligence';
import type { TranscriptSegment, URLCheckResult } from '../core/types';

export interface DrillScenario {
  id: string;
  title: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  tactic_focus: string;
  opening_line: string;
  turns: Array<{
    scammer_line: string;
    choices: Array<{
      id: string;
      text: string;
      is_safe: boolean;
      feedback: string;
      points: number;
    }>;
  }>;
}

/**
 * COMPLETELY ISOLATED FROM LIVE GUARD.
 * Conversational role-play training module for family members only.
 * Never connected to the live-call path or Family MCP.
 */
export const SCAM_DRILL_SCENARIOS: DrillScenario[] = [
  {
    id: 'drill_digital_arrest',
    title: 'Drill 1: Fake CBI Digital Arrest Video Call',
    difficulty: 'Intermediate',
    tactic_focus: 'Fake Authority + Isolation + Threats',
    opening_line:
      'Main CBI Cyber Cell se Inspector bol raha hoon. Aapke Aadhaar par drugs parcel mila hai. Abhi room lock karo aur kisi ko mat batana.',
    turns: [
      {
        scammer_line:
          'Agar aapne apne bete ko bataya toh aapko aur parivar ko abhi arrest warrant par jail bhej diya jayega. Video call par raho.',
        choices: [
          {
            id: 'c1_panic',
            text: 'Theek hai sir main kisi ko nahi bataunga, please bataiye kya karna hai.',
            is_safe: false,
            feedback:
              'Dangerous: Scammers use fear and secrecy ("kisi ko mat batana") to isolate you so family cannot reality-check the threat.',
            points: 0,
          },
          {
            id: 'c1_safe',
            text: 'Main bina apne bete Ansh se baat kiye kisi bhi officer se baat nahi karunga. Main call kaat raha hoon.',
            is_safe: true,
            feedback:
              'Correct! Indian law enforcement never conducts "digital arrests" or forbids contacting family.',
            points: 50,
          },
        ],
      },
      {
        scammer_line:
          'Court clearance ke liye RBI Safe Custody Account mein ₹50,000 turant transfer kijiye, verification ke baad wapas aa jayega.',
        choices: [
          {
            id: 'c2_pay',
            text: 'Refund mil jayega toh main abhi UPI se bhej deta hoon.',
            is_safe: false,
            feedback:
              'Trap! There is no such thing as an "RBI Safe Custody Account" for police verification.',
            points: 0,
          },
          {
            id: 'c2_hangup',
            text: 'Call disconnect karke 1930 aur family ko inform karta hoon.',
            is_safe: true,
            feedback:
              'Excellent! Hanging up immediately and verifying with family / 1930 breaks the scam completely.',
            points: 50,
          },
        ],
      },
    ],
  },
  {
    id: 'drill_bank_kyc',
    title: 'Drill 2: Urgent Bank KYC + AnyDesk Screen Share',
    difficulty: 'Beginner',
    tactic_focus: 'Urgency + Remote Access + OTP',
    opening_line:
      'Aapka SBI account aaj 2 baje band ho jayega. Verification ke liye AnyDesk download karein aur OTP batayein.',
    turns: [
      {
        scammer_line: 'Sirf 5 minute bache hain, Play Store se AnyDesk install karke 9-digit code dijiye.',
        choices: [
          {
            id: 'b1_install',
            text: 'Account band na ho jaye isliye main AnyDesk install kar leta hoon.',
            is_safe: false,
            feedback:
              'Critical Mistake: AnyDesk gives the scammer full remote control over your phone, SMS, and banking apps.',
            points: 0,
          },
          {
            id: 'b1_refuse',
            text: 'Koi bhi bank remote app ya OTP phone par nahi maangta. Main branch ya official app par check karunga.',
            is_safe: true,
            feedback:
              'Spot on! Banks never ask customers to install AnyDesk/TeamViewer or share OTPs.',
            points: 50,
          },
        ],
      },
      {
        scammer_line: 'Main manager bol raha hoon, bas ek 6-digit OTP verify karwa dijiye.',
        choices: [
          {
            id: 'b2_otp',
            text: 'Bas ek baar verify karne ke liye OTP padh deta hoon.',
            is_safe: false,
            feedback: 'Never share OTPs — an OTP authorizes debits or account takeover.',
            points: 0,
          },
          {
            id: 'b2_end',
            text: 'Phone rakh kar number block karta hoon aur family ko alert karta hoon.',
            is_safe: true,
            feedback: 'Great response! Refusing OTPs and blocking the caller protects your account.',
            points: 50,
          },
        ],
      },
    ],
  },
];

export function analyzeSuspiciousMessageAndLinks(input: {
  messageText?: string;
  url?: string;
}): {
  isolated_module: 'SCAM_DRILL_MESSAGE_CHECKER';
  never_opened_links: true;
  message_analysis?: {
    score: number;
    risk_level: string;
    categories: string[];
    matched_phrases: string[];
    explanation: string;
  };
  url_checks: URLCheckResult[];
} {
  const engine = new DeterministicRuleEngine();
  const urlsFound = new Set<string>();

  if (input.url?.trim()) {
    urlsFound.add(input.url.trim());
  }

  if (input.messageText?.trim()) {
    const urlMatches = input.messageText.match(/https?:\/\/[^\s]+|[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?/gi) || [];
    for (const u of urlMatches) {
      if (u.includes('.') && !u.endsWith('.')) {
        urlsFound.add(u);
      }
    }
  }

  const urlChecks = Array.from(urlsFound).map((u) => inspectSuspiciousUrlOffline(u));

  let messageAnalysis:
    | {
        score: number;
        risk_level: string;
        categories: string[];
        matched_phrases: string[];
        explanation: string;
      }
    | undefined;

  if (input.messageText?.trim()) {
    const seg: TranscriptSegment = {
      id: 'msg_check_1',
      session_id: 'message_checker',
      speaker: 'CALLER',
      text: input.messageText,
      language: 'hinglish',
      timestamp_ms: Date.now(),
      iso_time: new Date().toISOString(),
      is_partial: false,
    };
    const evalRes = engine.evaluateWindow('message_checker', [seg]);
    // Boost score if message also contains a malicious/suspicious URL
    const maxUrlRisk = urlChecks.reduce((m, c) => Math.max(m, c.risk_score), 0);
    const combinedScore = Math.min(100, Math.max(evalRes.score, Math.round(evalRes.score * 0.7 + maxUrlRisk * 0.5)));

    messageAnalysis = {
      score: combinedScore,
      risk_level:
        combinedScore >= 75
          ? 'CRITICAL'
          : combinedScore >= 50
          ? 'HIGH'
          : combinedScore >= 25
          ? 'MEDIUM'
          : 'LOW',
      categories: evalRes.categories_detected,
      matched_phrases: evalRes.matches.map((m) => m.matched_phrase),
      explanation:
        evalRes.matches.length > 0 || maxUrlRisk >= 30
          ? `Detected ${evalRes.categories_detected.join(', ') || 'suspicious link pattern'} (${evalRes.matches.length} text signals, URL risk ${maxUrlRisk}/100). Do not click links or reply with OTPs.`
          : 'No obvious scam patterns detected, though always verify unknown senders independently.',
    };
  }

  return {
    isolated_module: 'SCAM_DRILL_MESSAGE_CHECKER',
    never_opened_links: true,
    message_analysis: messageAnalysis,
    url_checks: urlChecks,
  };
}
