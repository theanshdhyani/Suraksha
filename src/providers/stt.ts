import type { ServiceMode } from '../core/types';
import type { ProviderHealthReport, SpeechToTextProvider } from './interfaces';

export class MockSpeechToTextProvider implements SpeechToTextProvider {
  public readonly id = 'elevenlabs_scribe';
  public readonly name = 'MockSpeechToTextProvider (Simulated Scribe v2)';

  public getMode(): ServiceMode {
    return 'MOCK';
  }

  public async healthCheck(): Promise<ProviderHealthReport> {
    return {
      id: this.id,
      name: this.name,
      mode: 'MOCK',
      status: 'MOCK',
      detail: 'Streaming progressive transcript simulator ready (Hindi/Hinglish/English).',
      checked_at: new Date().toISOString(),
    };
  }
}

export class ElevenLabsScribeProvider implements SpeechToTextProvider {
  public readonly id = 'elevenlabs_scribe';
  public readonly name = 'ElevenLabsScribeProvider (Scribe v2 Realtime WS)';

  public getMode(): ServiceMode {
    return 'LIVE';
  }

  public createLiveSessionConfig(languageHint = 'hi') {
    const apiKey = process.env.ELEVENLABS_API_KEY?.trim() || '';
    const wsUrl = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&audio_format=pcm_16000&language_code=${encodeURIComponent(languageHint)}`;
    return {
      wsUrl,
      modelId: 'scribe_v2_realtime',
      headersPresent: Boolean(apiKey),
    };
  }

  public async healthCheck(): Promise<ProviderHealthReport> {
    const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
    const checked_at = new Date().toISOString();
    if (!apiKey) {
      return {
        id: this.id,
        name: this.name,
        mode: 'LIVE',
        status: 'PENDING CONFIGURATION',
        detail: 'Missing ELEVENLABS_API_KEY for Scribe v2 WebSocket.',
        checked_at,
      };
    }

    try {
      const resp = await fetch('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': apiKey },
        signal: AbortSignal.timeout(4000),
      });
      if (!resp.ok) {
        return {
          id: this.id,
          name: this.name,
          mode: 'LIVE',
          status: 'CONNECTION FAILED',
          detail: `ElevenLabs API returned HTTP ${resp.status}.`,
          checked_at,
        };
      }
      return {
        id: this.id,
        name: this.name,
        mode: 'LIVE',
        status: 'LIVE',
        detail: 'ElevenLabs Scribe v2 API key verified.',
        checked_at,
      };
    } catch (err) {
      return {
        id: this.id,
        name: this.name,
        mode: 'LIVE',
        status: 'CONNECTION FAILED',
        detail: err instanceof Error ? err.message : 'Network error reaching ElevenLabs.',
        checked_at,
      };
    }
  }
}
