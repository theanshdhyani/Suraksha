import type { ScenarioDefinition } from './types';

export const PREDEFINED_SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'cbi_digital_arrest',
    title: 'CBI Digital Arrest & Isolation Scam (Hinglish)',
    caller_label: 'Unknown (+91 98110-44291) · Claims: CBI Cyber Cell',
    caller_number: '+91 98110-44291',
    language: 'hinglish',
    expected_risk: 'CRITICAL',
    summary:
      'Caller impersonates CBI Inspector, threatens non-bailable digital arrest warrant over Aadhaar misuse, demands staying isolated on video call without telling family, and asks for RBI verification transfer.',
    segments: [
      {
        delay_ms: 800,
        speaker: 'CALLER',
        language: 'hinglish',
        text: 'Hello, main Inspector Rajesh Verma bol raha hoon CBI Cyber Cell Mumbai Police se.',
      },
      {
        delay_ms: 1900,
        speaker: 'PARENT',
        language: 'hinglish',
        text: 'Haan ji? Kya hua inspector sahab?',
      },
      {
        delay_ms: 2100,
        speaker: 'CALLER',
        language: 'hinglish',
        text: 'Aapke Aadhaar card par ek FedEx parcel seized hua hai aur aapke naam par digital arrest warrant aur FIR darj ho gayi hai.',
      },
      {
        delay_ms: 2400,
        speaker: 'CALLER',
        language: 'hinglish',
        text: 'Yeh national security case hai. Ghar walon ko mat batana aur bete ko mat batana, warna police team bhej rahe hain.',
      },
      {
        delay_ms: 2400,
        speaker: 'CALLER',
        language: 'hinglish',
        text: 'Abhi ke abhi video call pe raho, call mat katna aur RBI verification account mein turant paise transfer karo.',
      },
    ],
  },
  {
    id: 'bank_kyc_otp',
    title: 'Bank KYC Block & Urgent OTP Scam (Hindi / Hinglish)',
    caller_label: 'Unknown (+91 70421-88310) · Claims: SBI KYC Desk',
    caller_number: '+91 70421-88310',
    language: 'hinglish',
    expected_risk: 'HIGH',
    summary:
      'Caller impersonates SBI KYC department, creates urgency that account will be blocked within 10 minutes, and demands OTP and ATM PIN.',
    segments: [
      {
        delay_ms: 800,
        speaker: 'CALLER',
        language: 'hinglish',
        text: 'Namaste, main SBI KYC department fraud cell se bol raha hoon.',
      },
      {
        delay_ms: 1900,
        speaker: 'CALLER',
        language: 'hinglish',
        text: 'Aapka KYC expire ho gaya hai aur aapka bank account 10 minute mein freeze aur blocked ho jayega.',
      },
      {
        delay_ms: 2200,
        speaker: 'CALLER',
        language: 'hinglish',
        text: 'Abhi ke abhi turant verify karne ke liye jo 6 digit OTP aaya hai, woh OTP batao aur apna ATM PIN confirm karo.',
      },
      {
        delay_ms: 2200,
        speaker: 'CALLER',
        language: 'hinglish',
        text: 'Kisi ko mat batana kyunki yeh confidential banking verification hai.',
      },
    ],
  },
  {
    id: 'remote_access_trai',
    title: 'TRAI SIM Disconnect & AnyDesk Takeover (English / Hinglish)',
    caller_label: 'Unknown (+91 88002-19405) · Claims: TRAI Compliance',
    caller_number: '+91 88002-19405',
    language: 'en',
    expected_risk: 'HIGH',
    summary:
      'Caller impersonates TRAI, threatens imminent SIM suspension and prosecution, and pressures parent to install AnyDesk and share screen.',
    segments: [
      {
        delay_ms: 900,
        speaker: 'CALLER',
        language: 'en',
        text: 'This is an automated compliance transfer from TRAI Telecom Regulatory Authority.',
      },
      {
        delay_ms: 2000,
        speaker: 'CALLER',
        language: 'en',
        text: 'Your mobile number will be disconnected within 15 minutes due to illegal complaints and imminent legal action.',
      },
      {
        delay_ms: 2200,
        speaker: 'CALLER',
        language: 'hinglish',
        text: 'Turant Play Store se AnyDesk install karo aur screen share karo verification ke liye. Do not inform family.',
      },
    ],
  },
  {
    id: 'normal_family_call',
    title: 'Normal Family & Legitimate Appointment Call (Safe Baseline)',
    caller_label: 'Dr. Sharma Clinic (+91 98201-55120)',
    caller_number: '+91 98201-55120',
    language: 'hinglish',
    expected_risk: 'LOW',
    summary:
      'Normal polite call mentioning bank branch visit later in the week without threats, isolation, OTP requests, or urgency. Demonstrates zero false positives.',
    segments: [
      {
        delay_ms: 900,
        speaker: 'CALLER',
        language: 'hinglish',
        text: 'Namaste aunty, main Dr. Sharma ke clinic se Priya bol rahi hoon.',
      },
      {
        delay_ms: 1900,
        speaker: 'PARENT',
        language: 'hinglish',
        text: 'Haan beta namaste, batao.',
      },
      {
        delay_ms: 2000,
        speaker: 'CALLER',
        language: 'hinglish',
        text: 'Aapka Thursday subah 11 baje ka routine checkup confirm karna tha. Ansh ko bhi saath le aana agar woh free ho.',
      },
      {
        delay_ms: 2000,
        speaker: 'CALLER',
        language: 'hinglish',
        text: 'Clinic ke paas wale bank branch mein agar kaam ho toh aaram se baad mein kar lena, koi jaldi nahi hai.',
      },
    ],
  },
];
