/**
 * Speech helpers through the Lovable AI Gateway. Server-only.
 * Transcription: dedicated /v1/audio/transcriptions endpoint (multipart, SSE).
 * Speech: /v1/audio/speech with the Gemini body (SSE of raw 24 kHz PCM).
 */

export const GATEWAY_BASE_URL = "https://ai.gateway.lovable.dev";
export const STT_MODEL = "google/gemini-3.5-transcribe";
export const TTS_MODEL = "google/gemini-3.1-flash-tts-preview";
export const TTS_VOICE = "Kore";

export type TranscriptionConfig = {
  baseURL: string;
  apiKey: string;
  model: string;
  maxFileBytes: number;
  audioOnly: boolean;
};

export async function transcribe(
  config: TranscriptionConfig,
  file: File,
  options: {
    buffered?: boolean;
    language?: string;
    signal?: AbortSignal;
  } = {},
) {
  if (!file.size || file.size > config.maxFileBytes) throw new Error("Invalid audio file size");
  if (!file.type.startsWith("audio/") && (config.audioOnly || !file.type.startsWith("video/"))) {
    throw new Error("Unexpected media MIME type");
  }
  const form = new FormData();
  form.append("model", config.model);
  form.append("file", file, file.name);
  form.append("response_format", "json");
  if (!options.buffered) form.append("stream", "true");
  if (options.language) form.append("language", options.language);
  return fetch(`${config.baseURL}/v1/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

export type SpeechConfig = {
  baseURL: string;
  apiKey: string;
  model: string;
  format: "openai" | "gemini" | "elevenlabs";
  voice: string;
};

export function speechBody(config: SpeechConfig, text: string, download = false) {
  switch (config.format) {
    case "gemini":
      return {
        model: config.model,
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voice } } },
        },
        stream_format: download ? "audio" : "sse",
      };
    case "elevenlabs":
      return { model: config.model, text, voice_id: config.voice, output_format: "mp3_44100_128" };
    case "openai":
      return {
        model: config.model,
        input: text,
        voice: config.voice,
        stream_format: download ? "audio" : "sse",
        response_format: download ? "mp3" : "pcm",
      };
  }
}

export async function requestSpeech(config: SpeechConfig, text: string, download = false, signal?: AbortSignal) {
  return fetch(`${config.baseURL}/v1/audio/speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(speechBody(config, text, download)),
    ...(signal ? { signal } : {}),
  });
}
