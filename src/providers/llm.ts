import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type {
  LLMExplanation,
  RuleEngineEvaluation,
  ServiceMode,
  TranscriptSegment,
} from '../core/types';
import type { LLMProvider, ProviderHealthReport } from './interfaces';

export class MockLLMProvider implements LLMProvider {
  public readonly id = 'amazon_bedrock';
  public readonly name = 'MockLLMProvider (Simulated Amazon Bedrock Explanation)';

  public getMode(): ServiceMode {
    return 'MOCK';
  }

  public async healthCheck(): Promise<ProviderHealthReport> {
    return {
      id: this.id,
      name: this.name,
      mode: 'MOCK',
      status: 'MOCK',
      detail: 'Context-aware Hindi/Hinglish family explanation generator active (read-only advisory).',
      checked_at: new Date().toISOString(),
    };
  }

  public async explainRiskForFamily(input: {
    evaluation: RuleEngineEvaluation;
    transcript: TranscriptSegment[];
    guardianName: string;
  }): Promise<LLMExplanation> {
    const { evaluation, guardianName } = input;
    const cats = evaluation.categories_detected;
    const phrases = evaluation.matches.map((m) => `"${m.matched_phrase}"`).slice(0, 4);

    const tacticsList: string[] = [];
    if (cats.includes('FAKE_AUTHORITY')) {
      tacticsList.push('Impersonating CBI / Police / Bank / TRAI authority');
    }
    if (cats.includes('THREATS')) {
      tacticsList.push('Fabricating arrest warrants, FIRs, or "Digital Arrest" threats');
    }
    if (cats.includes('ISOLATION')) {
      tacticsList.push('Isolating the parent by forbidding them from speaking with family');
    }
    if (cats.includes('URGENCY')) {
      tacticsList.push('Creating artificial deadlines to block rational verification');
    }
    if (cats.includes('MONEY_CREDENTIALS')) {
      tacticsList.push('Demanding OTP, PIN, or urgent bank/UPI verification transfers');
    }
    if (cats.includes('REMOTE_ACCESS')) {
      tacticsList.push('Requesting remote screen-share apps (AnyDesk / TeamViewer)');
    }

    const hindiParts: string[] = [];
    if (cats.includes('FAKE_AUTHORITY') || cats.includes('THREATS')) {
      hindiParts.push(
        'Yeh call ek nakli authority / Digital Arrest scam lag rahi hai. Asli Police, CBI ya RBI kabhi video call par arrest ya paise transfer karne ko nahi kehti.'
      );
    }
    if (cats.includes('ISOLATION')) {
      hindiParts.push(
        'Caller parivar ko batane se mana kar raha hai — yeh scammer ki sabse badi pehchaan hai.'
      );
    }
    if (cats.includes('MONEY_CREDENTIALS')) {
      hindiParts.push('Kripya koi bhi OTP, PIN ya UPI transfer bilkul share na karein.');
    }
    if (cats.includes('REMOTE_ACCESS')) {
      hindiParts.push('Koi bhi screen-share ya AnyDesk app install na karein.');
    }

    return {
      provider: this.name,
      mode: 'MOCK',
      why_flagged: `Deterministic Rule Engine scored ${evaluation.score}/100 (${evaluation.risk_level}) from ${evaluation.matches.length} matched signals (${phrases.join(', ')}) within a ${(evaluation.window_duration_ms / 1000).toFixed(0)}s rolling window.`,
      family_risk_summary: `${guardianName}, the caller is using high-pressure social engineering (${cats.join(', ')}) to isolate your parent and extract money or credentials. SURAKSHA interrupted only the parent and never spoke to the caller.`,
      hindi_explanation:
        hindiParts.join(' ') ||
        'Yeh ek sandigdh scam call hai. Kripya turant call kaat dein aur parivar ke saath verify karein.',
      suggested_guardian_script: `Ask calmly: "Mummy/Papa, main ${guardianName} bol raha hoon — please phone speaker par rakhiye ya kaat dijiye, hum saath mein official number par verify karenge."`,
      tactics_breakdown: tacticsList,
      generated_at: new Date().toISOString(),
    };
  }
}

export class AmazonBedrockProvider implements LLMProvider {
  public readonly id = 'amazon_bedrock';
  public readonly name = 'AmazonBedrockProvider (AWS Bedrock Converse API)';

  public getMode(): ServiceMode {
    return 'LIVE';
  }

  public async healthCheck(): Promise<ProviderHealthReport> {
    const region = process.env.AWS_REGION?.trim();
    const modelId = process.env.BEDROCK_MODEL_ID?.trim();
    const checked_at = new Date().toISOString();

    if (!region || !modelId) {
      return {
        id: this.id,
        name: this.name,
        mode: 'LIVE',
        status: 'PENDING CONFIGURATION',
        detail: 'Missing AWS_REGION or BEDROCK_MODEL_ID.',
        checked_at,
      };
    }

    const hasExplicitCreds =
      Boolean(process.env.AWS_ACCESS_KEY_ID?.trim()) &&
      Boolean(process.env.AWS_SECRET_ACCESS_KEY?.trim());
    if (!hasExplicitCreds && !process.env.AWS_WEB_IDENTITY_TOKEN_FILE && !process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI) {
      return {
        id: this.id,
        name: this.name,
        mode: 'LIVE',
        status: 'PENDING CONFIGURATION',
        detail: 'AWS_REGION & BEDROCK_MODEL_ID set; awaiting IAM role or AWS credentials.',
        checked_at,
      };
    }

    return {
      id: this.id,
      name: this.name,
      mode: 'LIVE',
      status: 'LIVE',
      detail: `Bedrock client configured for region="${region}" model="${modelId}".`,
      checked_at,
    };
  }

  public async explainRiskForFamily(input: {
    evaluation: RuleEngineEvaluation;
    transcript: TranscriptSegment[];
    guardianName: string;
  }): Promise<LLMExplanation> {
    const region = process.env.AWS_REGION?.trim();
    const modelId = process.env.BEDROCK_MODEL_ID?.trim();
    if (!region || !modelId) {
      throw new Error('Amazon Bedrock LIVE mode requires AWS_REGION and BEDROCK_MODEL_ID.');
    }

    // Bedrock is strictly invoked ONLY for family explanation — never authorization or caller reply.
    const client = new BedrockRuntimeClient({ region });
    const prompt = [
      'You are generating a calm explanation for a family guardian after a deterministic rule engine flagged a scam phone call.',
      'Return strict JSON with keys: why_flagged, family_risk_summary, hindi_explanation, suggested_guardian_script, tactics_breakdown (string[]).',
      `Categories: ${input.evaluation.categories_detected.join(', ')}`,
      `Score: ${input.evaluation.score}/100`,
      `Matched phrases: ${input.evaluation.matches.map((m) => m.matched_phrase).join('; ')}`,
      `Guardian Name: ${input.guardianName}`,
    ].join('\n');

    const command = new ConverseCommand({
      modelId,
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: 450, temperature: 0.2 },
    });

    const resp = await client.send(command);
    const text = resp.output?.message?.content?.[0]?.text || '{}';
    const parsed = JSON.parse(text);

    return {
      provider: this.name,
      mode: 'LIVE',
      why_flagged: String(parsed.why_flagged || input.evaluation.verdict_summary),
      family_risk_summary: String(parsed.family_risk_summary || ''),
      hindi_explanation: String(parsed.hindi_explanation || ''),
      suggested_guardian_script: String(parsed.suggested_guardian_script || ''),
      tactics_breakdown: Array.isArray(parsed.tactics_breakdown)
        ? parsed.tactics_breakdown.map(String)
        : input.evaluation.categories_detected,
      generated_at: new Date().toISOString(),
    };
  }
}
