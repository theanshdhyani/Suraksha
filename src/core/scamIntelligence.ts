import type { ScamCategory, ScamPlaybookMatch, URLCheckResult } from './types';

export interface ScamPlaybook {
  playbook_id: string;
  title: string;
  required_categories: ScamCategory[];
  description: string;
  recommended_family_action: string;
}

export const LOCAL_SCAM_PLAYBOOKS: ScamPlaybook[] = [
  {
    playbook_id: 'PB_DIGITAL_ARREST',
    title: 'Digital Arrest & Fake Law Enforcement Impersonation',
    required_categories: ['FAKE_AUTHORITY', 'THREATS', 'ISOLATION'],
    description:
      'Scammers pose as CBI, Police, Customs, or NCB officers, fabricate an FIR or arrest warrant, and force the victim onto an isolated video call.',
    recommended_family_action:
      'Disconnect the call immediately. Indian law enforcement never conducts "digital arrests" or demands verification transfers over video calls.',
  },
  {
    playbook_id: 'PB_BANK_KYC_OTP',
    title: 'Fake Bank KYC Freeze & OTP Extraction',
    required_categories: ['FAKE_AUTHORITY', 'URGENCY', 'MONEY_CREDENTIALS'],
    description:
      'Caller claims the victim’s bank account or SIM will be blocked today unless an urgent KYC update and OTP/PIN verification are shared.',
    recommended_family_action:
      'Never share OTPs or PINs. Call the official bank number printed on the back of the debit card with a family member present.',
  },
  {
    playbook_id: 'PB_REMOTE_ACCESS_TAKEOVER',
    title: 'Remote Screen-Share & Device Takeover Scam',
    required_categories: ['REMOTE_ACCESS', 'URGENCY'],
    description:
      'Caller tricks the victim into installing AnyDesk, TeamViewer, or an APK file to capture banking credentials or approve UPI mandates.',
    recommended_family_action:
      'Uninstall any remote-access application immediately, disable Wi-Fi/mobile data if already installed, and notify the bank.',
  },
  {
    playbook_id: 'PB_PARCEL_COURIER_EXTORTION',
    title: 'Customs / FedEx Contraband Parcel Extortion',
    required_categories: ['FAKE_AUTHORITY', 'THREATS'],
    description:
      'Caller claims an international parcel containing illegal items was seized under the victim’s Aadhaar and escalates to a fake police transfer.',
    recommended_family_action:
      'End the call and verify independently; genuine customs notices arrive via official postal or government channels, never via demand calls.',
  },
];

const KNOWN_MALICIOUS_DOMAINS = new Set([
  'sbi-kyc-update-verify.xyz',
  'hdfc-pan-rekyc.top',
  'rbi-safe-custody-pay.in',
  'cbi-digital-warrant-portal.com',
  'trai-sim-unblock-verify.online',
  'anydesk-support-india.apk.cc',
]);

const SUSPICIOUS_TLDS = ['.xyz', '.top', '.club', '.tk', '.ml', '.ga', '.cf', '.click', '.loan'];
const SHORTENER_HOSTS = new Set(['bit.ly', 'tinyurl.com', 't.co', 'cutt.ly', 'rb.gy', 'is.gd']);
const BRAND_IMPERSONATION_TOKENS = [
  'sbi',
  'hdfc',
  'icici',
  'rbi',
  'cbi',
  'police',
  'trai',
  'kyc',
  'epfo',
  'aadhaar',
  'uidai',
  'income-tax',
  'cybercrime',
];

const PLAYBOOK_SIGNAL_BOOSTS: Record<string, RegExp[]> = {
  PB_DIGITAL_ARREST: [
    /digital\s*arrest/i,
    /डिजिटल\s*अरेस्ट/i,
    /skype/i,
    /video\s*call/i,
    /\bcbi\b/i,
    /सीबीआई/i,
    /\bfir\b/i,
  ],
  PB_BANK_KYC_OTP: [/\botp\b/i, /ओटीपी/i, /\bkyc\b/i, /\bpin\b/i, /\bupi\b/i, /\bpan\b/i],
  PB_REMOTE_ACCESS_TAKEOVER: [/anydesk/i, /teamviewer/i, /quicksupport/i, /screen\s*shar/i, /\.apk/i],
  PB_PARCEL_COURIER_EXTORTION: [/fedex/i, /courier/i, /customs/i, /parcel/i, /narcotics/i],
};

export function matchScamPlaybook(
  categories: ScamCategory[],
  matchedPhrases: string[] = []
): ScamPlaybookMatch | null {
  if (categories.length === 0) return null;

  const phraseBlob = matchedPhrases.join(' ').toLowerCase();
  let best: { playbook: ScamPlaybook; score: number; confidence: number } | null = null;

  for (const pb of LOCAL_SCAM_PLAYBOOKS) {
    const overlap = pb.required_categories.filter((c) => categories.includes(c)).length;
    if (overlap === 0) continue;

    const boostPatterns = PLAYBOOK_SIGNAL_BOOSTS[pb.playbook_id] || [];
    const signalHits = phraseBlob
      ? boostPatterns.filter((rx) => rx.test(phraseBlob)).length
      : 0;

    const coverage = overlap / pb.required_categories.length;
    const score = overlap * 20 + coverage * 15 + signalHits * 12;
    const confidence = Math.min(
      99,
      Math.round(coverage * 75 + categories.length * 4 + Math.min(18, signalHits * 6))
    );

    if (!best || score > best.score || (score === best.score && confidence > best.confidence)) {
      best = { playbook: pb, score, confidence };
    }
  }

  if (!best) return null;
  return {
    playbook_id: best.playbook.playbook_id,
    title: best.playbook.title,
    tactics: best.playbook.required_categories,
    confidence: best.confidence,
    description: best.playbook.description,
    recommended_family_action: best.playbook.recommended_family_action,
  };
}

/**
 * Offline URL & threat-intel inspection. NEVER opens, fetches, or clicks the URL.
 */
export function inspectSuspiciousUrlOffline(rawUrl: string): URLCheckResult {
  const checkedAt = new Date().toISOString();
  const trimmed = rawUrl.trim();
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let host = trimmed.toLowerCase();
  let pathname = '';
  let protocol = 'https:';

  try {
    const parsed = new URL(candidate);
    host = parsed.hostname.toLowerCase();
    pathname = parsed.pathname.toLowerCase();
    protocol = parsed.protocol;
  } catch {
    return {
      url: rawUrl,
      normalized_host: 'invalid-url',
      verdict: 'SUSPICIOUS',
      risk_score: 65,
      indicators: ['Malformed or obfuscated URL structure'],
      checked_at: checkedAt,
      never_fetched_live: true,
    };
  }

  const indicators: string[] = [];
  let riskScore = 0;

  if (KNOWN_MALICIOUS_DOMAINS.has(host)) {
    indicators.push('Matched local threat-intelligence phishing blocklist');
    riskScore += 90;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    indicators.push('Direct IPv4 host instead of verified organization domain');
    riskScore += 45;
  }
  if (host.includes('xn--')) {
    indicators.push('IDN punycode domain (possible homograph spoofing)');
    riskScore += 40;
  }
  if (SUSPICIOUS_TLDS.some((tld) => host.endsWith(tld))) {
    indicators.push('High-risk disposable TLD commonly abused in India phishing campaigns');
    riskScore += 30;
  }
  if (SHORTENER_HOSTS.has(host)) {
    indicators.push('URL shortener hides final destination');
    riskScore += 25;
  }
  if (pathname.endsWith('.apk') || host.includes('apk')) {
    indicators.push('Direct Android APK download indicator (malware / remote-access risk)');
    riskScore += 55;
  }
  if (protocol === 'http:' && /^http:\/\//i.test(trimmed)) {
    indicators.push('Unencrypted HTTP scheme');
    riskScore += 15;
  }

  const officialDomains = [
    'onlinesbi.sbi',
    'sbi.co.in',
    'hdfcbank.com',
    'icicibank.com',
    'rbi.org.in',
    'cybercrime.gov.in',
    'sancharsaathi.gov.in',
  ];
  const isOfficial = officialDomains.some((d) => host === d || host.endsWith(`.${d}`));

  if (!isOfficial) {
    const impersonated = BRAND_IMPERSONATION_TOKENS.filter((tok) => host.includes(tok));
    if (impersonated.length > 0) {
      indicators.push(
        `Possible brand/authority impersonation (${impersonated.join(', ')}) on non-official host`
      );
      riskScore += 40;
    }
  }

  riskScore = Math.min(100, riskScore);
  const verdict: URLCheckResult['verdict'] =
    riskScore >= 60 ? 'MALICIOUS' : riskScore >= 25 ? 'SUSPICIOUS' : 'SAFE';

  return {
    url: rawUrl,
    normalized_host: host,
    verdict,
    risk_score: riskScore,
    indicators:
      indicators.length > 0
        ? indicators
        : ['No known phishing or malware indicators in offline intelligence check'],
    matched_dataset_entry: KNOWN_MALICIOUS_DOMAINS.has(host) ? host : undefined,
    checked_at: checkedAt,
    never_fetched_live: true,
  };
}
