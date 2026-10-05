import { createParser } from "eventsource-parser";
import { supabase } from "@/integrations/supabase/client";

/** Client-side voice helpers: WAV recording, transcription, and PCM playback. */

export function encodeWav(chunks: readonly Float32Array[], sampleRate: number): Blob {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new ArrayBuffer(44 + length * 2);
  const view = new DataView(bytes);
  const tag = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  tag(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, length * 2, true);
  let offset = 44;
  for (const chunk of chunks)
    for (const value of chunk) {
      const sample = Math.max(-1, Math.min(1, value));
      view.setInt16(offset, sample * (sample < 0 ? 32768 : 32767), true);
      offset += 2;
    }
  return new Blob([bytes], { type: "audio/wav" });
}

export async function recordWav(): Promise<{ stop: () => Promise<File> }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let context: AudioContext | undefined;
  try {
    context = new AudioContext();
    await context.resume();
    const audioContext = context;
    const source = audioContext.createMediaStreamSource(stream);
    const node = audioContext.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    node.onaudioprocess = (event) => chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    source.connect(node);
    node.connect(audioContext.destination);
    let stopped = false;
    return {
      async stop() {
        if (stopped) throw new Error("Recording already stopped");
        stopped = true;
        stream.getTracks().forEach((track) => track.stop());
        node.disconnect();
        source.disconnect();
        node.onaudioprocess = null;
        const blob = encodeWav(chunks, audioContext.sampleRate);
        await audioContext.close();
        if (blob.size < 2048) throw new Error("Recording was empty; please record again");
        return new File([blob], "recording.wav", { type: "audio/wav" });
      },
    };
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    await context?.close();
    throw error;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

/** Records nothing itself; uploads a completed WAV and returns the transcript text. */
export async function transcribeAudio(file: File, signal?: AbortSignal): Promise<string> {
  const form = new FormData();
  form.append("file", file, file.name);
  const res = await fetch("/api/transcribe", {
    method: "POST",
    headers: await authHeaders(),
    body: form,
    signal: signal ?? null,
  });
  if (!res.ok) throw new Error(await res.text().then((t) => t || `Transcription failed (${res.status})`));
  if (!res.body) throw new Error("Transcription returned nothing");

  let text = "";
  let done = false;
  const parser = createParser({
    onEvent(event) {
      let payload: { type?: string; delta?: string; text?: string; error?: { message?: string } };
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (payload.error) throw new Error(payload.error.message || "Transcription failed");
      if (payload.type === "transcript.text.done") {
        done = true;
        text = payload.text ?? text;
        return;
      }
      if (payload.type === "transcript.text.delta" && payload.delta) text += payload.delta;
    },
  });
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      parser.feed(next.value);
    }
    parser.reset({ consume: true });
  } finally {
    reader.releaseLock();
  }
  if (!done && !text.trim()) throw new Error("Didn't catch any speech — try again");
  return text.trim();
}

function decodePCM(pending: Uint8Array, incoming: Uint8Array) {
  const bytes = new Uint8Array(pending.length + incoming.length);
  bytes.set(pending);
  bytes.set(incoming, pending.length);
  const usable = bytes.length - (bytes.length % 2);
  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(usable / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
  return { samples, pending: bytes.slice(usable) };
}

/** Streams spoken audio for `text` from /api/speech and plays it. */
export async function streamSpeech(endpoint: string, text: string, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const context = new AudioContext({ sampleRate: 24000 });
  const sources = new Set<AudioBufferSourceNode>();
  let playhead = 0;
  let pending = new Uint8Array(0);
  let completed = false;
  let samplesPlayed = 0;
  const controller = new AbortController();
  const abort = () => {
    controller.abort(signal?.reason);
    for (const source of sources) source.stop();
  };
  signal?.addEventListener("abort", abort, { once: true });
  let playback: Promise<void> = Promise.resolve();
  try {
    if (context.state === "suspended") await context.resume();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new Error(`Speech failed: ${response.status} ${await response.text()}`);
    const parser = createParser({
      onEvent(event) {
        const payload = JSON.parse(event.data) as { type: string; audio?: string; error?: unknown };
        if (payload.type === "error" || payload.error) throw new Error(`Speech failed: ${event.data}`);
        if (payload.type === "speech.audio.done") {
          completed = true;
          return;
        }
        if (payload.type !== "speech.audio.delta") return;
        if (completed || !payload.audio) throw new Error("Invalid speech audio event");
        const decoded = decodePCM(pending, Uint8Array.from(atob(payload.audio), (c) => c.charCodeAt(0)));
        pending = new Uint8Array(decoded.pending);
        if (!decoded.samples.length) return;
        samplesPlayed += decoded.samples.length;
        const buffer = context.createBuffer(1, decoded.samples.length, 24000);
        buffer.copyToChannel(decoded.samples, 0);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        sources.add(source);
        playback = new Promise<void>((resolve) => {
          source.onended = () => {
            sources.delete(source);
            resolve();
          };
        });
        // Device startup can clip audio scheduled exactly at currentTime.
        playhead = Math.max(playhead, context.currentTime + 0.05);
        source.start(playhead);
        playhead += buffer.duration;
      },
    });
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        parser.feed(next.value);
      }
      parser.reset({ consume: true });
    } finally {
      reader.releaseLock();
    }
    if (!completed || !samplesPlayed || pending.length) throw new Error("Incomplete speech stream");
    await playback;
    signal?.throwIfAborted();
  } finally {
    signal?.removeEventListener("abort", abort);
    controller.abort();
    for (const source of sources) source.stop();
    await context.close();
  }
}
