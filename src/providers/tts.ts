import type { ServiceMode } from '../core/types';
import type {
  ProviderHealthReport,
  TextToSpeechProvider,
  TextToSpeechResult,
} from './interfaces';

export const FAMILY_INTERRUPTION_PROMPT = 'Kya main Ansh ko abhi bula loon?';

export interface ConsentedVoiceProfile {
  voice_id: string;
  family_member_name: string;
  consent_granted: boolean;
  consent_record_id: string;
  consented_at: string;
}

export const CONSENTED_FAMILY_VOICE: ConsentedVoiceProfile = {
  voice_id: 'ansh-consented-demo-voice',
  family_member_name: 'Ansh (Son / Primary Guardian)',
  consent_granted: true,
  consent_record_id: 'consent_ansh_2026_verified',
  consented_at: '2026-11-20T10:00:00.000Z',
};

export class MockTTSProvider implements TextToSpeechProvider {
  public readonly id = 'elevenlabs_tts';
  public readonly name = 'MockTTSProvider (Pre-Consented Local Family Clip)';

  public getMode(): ServiceMode {
    return 'MOCK';
  }

  public async healthCheck(): Promise<ProviderHealthReport> {
    return {
      id: this.id,
      name: this.name,
      mode: 'MOCK',
      status: 'MOCK',
      detail: 'Local pre-consented voice clip & browser SpeechSynthesis fallback ready.',
      checked_at: new Date().toISOString(),
    };
  }

  public async synthesizeFamilyPrompt(
    promptText: string = FAMILY_INTERRUPTION_PROMPT,
    voiceId?: string
  ): Promise<TextToSpeechResult> {
    if (!CONSENTED_FAMILY_VOICE.consent_granted) {
      throw new Error('Family voice synthesis blocked: explicit family consent is required.');
    }
    return {
      prompt_text: promptText,
      voice_id: voiceId || CONSENTED_FAMILY_VOICE.voice_id,
      consented: true,
      consent_record_id: CONSENTED_FAMILY_VOICE.consent_record_id,
      provider: this.name,
      mode: 'MOCK',
      audio_url: '/api/tts/prompt-audio',
      browser_speech_fallback: true,
      generated_at: new Date().toISOString(),
    };
  }
}

export class ElevenLabsTTSProvider implements TextToSpeechProvider {
  public readonly id = 'elevenlabs_tts';
  public readonly name = 'ElevenLabsTTSProvider (Consented Family Voice)';

  public getMode(): ServiceMode {
    return 'LIVE';
  }

  public async healthCheck(): Promise<ProviderHealthReport> {
    const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
    const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
    const checked_at = new Date().toISOString();

    if (!apiKey || !voiceId) {
      return {
        id: this.id,
        name: this.name,
        mode: 'LIVE',
        status: 'PENDING CONFIGURATION',
        detail: 'Missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID.',
        checked_at,
      };
    }

    try {
      const resp = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`, {
        headers: { 'xi-api-key': apiKey },
        signal: AbortSignal.timeout(4000),
      });
      if (!resp.ok) {
        return {
          id: this.id,
          name: this.name,
          mode: 'LIVE',
          status: 'CONNECTION FAILED',
          detail: `ElevenLabs Voice lookup failed (HTTP ${resp.status}).`,
          checked_at,
        };
      }
      return {
        id: this.id,
        name: this.name,
        mode: 'LIVE',
        status: 'LIVE',
        detail: `Configured ElevenLabs voice_id="${voiceId}" verified.`,
        checked_at,
      };
    } catch (err) {
      return {
        id: this.id,
        name: this.name,
        mode: 'LIVE',
        status: 'CONNECTION FAILED',
        detail: err instanceof Error ? err.message : 'Network error reaching ElevenLabs TTS.',
        checked_at,
      };
    }
  }

  public async synthesizeFamilyPrompt(
    promptText: string = FAMILY_INTERRUPTION_PROMPT,
    voiceId?: string
  ): Promise<TextToSpeechResult> {
    if (!CONSENTED_FAMILY_VOICE.consent_granted) {
      throw new Error('Family voice synthesis blocked: explicit family consent is required.');
    }
    const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
    const targetVoice = voiceId || process.env.ELEVENLABS_VOICE_ID?.trim() || '';
    if (!apiKey || !targetVoice) {
      throw new Error('ElevenLabs LIVE TTS requested without ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID.');
    }

    const resp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(targetVoice)}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: promptText,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.72, similarity_boost: 0.85 },
        }),
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!resp.ok) {
      throw new Error(`ElevenLabs TTS API error: HTTP ${resp.status}`);
    }

    const buf = Buffer.from(await resp.arrayBuffer());
    const dataUri = `data:audio/mpeg;base64,${buf.toString('base64')}`;

    return {
      prompt_text: promptText,
      voice_id: targetVoice,
      consented: true,
      consent_record_id: CONSENTED_FAMILY_VOICE.consent_record_id,
      provider: this.name,
      mode: 'LIVE',
      audio_url: dataUri,
      browser_speech_fallback: false,
      generated_at: new Date().toISOString(),
    };
  }
}

/**
 * Generates a gentle, audible 1.4-second dual-chime + warm tone WAV buffer locally
 * so DEMO MODE always has a valid playable audio endpoint without external API keys.
 */
export function generateLocalChimeWavBuffer(): Buffer {
  const sampleRate = 16000;
  const durationSec = 1.1;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataBytes = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const freq = t < 0.45 ? 523.25 : 659.25; // C5 -> E5 calm chime
    const localT = t < 0.45 ? t : t - 0.45;
    const envelope = Math.exp(-localT * 5.2);
    const sample = Math.sin(2 * Math.PI * freq * t) * 0.25 * envelope;
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }

  return buffer;
}
