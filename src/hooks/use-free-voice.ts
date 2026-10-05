import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { think } from "@/lib/astra/mini-brain";

/**
 * Free voice mode: Whisper (speech → text), Astra Mini (thinking) and Kokoro
 * (text → natural speech) all run in the browser. No credits, no outside AI.
 */
export type VoiceStatus = "idle" | "loading" | "listening" | "thinking" | "speaking" | "error";
export type VoiceLine = { role: "user" | "assistant"; text: string };

type Models = { stt: (audio: Float32Array) => Promise<{ text: string }>; tts: { generate: (t: string, o: { voice: string }) => Promise<{ toBlob: () => Blob }> } };
let modelsPromise: Promise<Models> | null = null;

function loadModels(onProgress: (p: string) => void): Promise<Models> {
  if (modelsPromise) return modelsPromise;
  modelsPromise = (async () => {
    const hasGPU = typeof navigator !== "undefined" && "gpu" in navigator;
    onProgress("Downloading ears (speech recognition)…");
    const { pipeline } = await import("@huggingface/transformers");
    const asr = (await pipeline("automatic-speech-recognition", "onnx-community/whisper-base.en", {
      device: hasGPU ? "webgpu" : "wasm",
      dtype: "q8",
    } as never)) as unknown as (a: Float32Array) => Promise<{ text: string }>;
    onProgress("Downloading voice…");
    const { KokoroTTS } = await import("kokoro-js");
    const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "wasm" });
    return { stt: asr, tts: tts as unknown as Models["tts"] };
  })().catch((e) => {
    modelsPromise = null;
    throw e;
  });
  return modelsPromise;
}

async function toMono16k(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    return buf.getChannelData(0).slice();
  } finally {
    void ctx.close();
  }
}

export function useFreeVoice(voiceName = "af_heart") {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [progress, setProgress] = useState("");
  const [lines, setLines] = useState<VoiceLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const memories = useRef<string[]>([]);
  const userInfo = useRef<{ id: string; name: string | null } | null>(null);

  const speak = useCallback(async (m: Models, text: string) => {
    if (!active.current) return;
    setStatus("speaking");
    const plain = text.replace(/[*_`#>-]/g, "").replace(/\n+/g, ". ");
    const out = await m.tts.generate(plain, { voice: voiceName });
    if (!active.current) return;
    const url = URL.createObjectURL(out.toBlob());
    await new Promise<void>((resolve) => {
      const a = new Audio(url);
      audio.current = a;
      a.onended = a.onerror = () => resolve();
      a.play().catch(() => resolve());
    });
    URL.revokeObjectURL(url);
    audio.current = null;
  }, [voiceName]);

  const listenOnce = useCallback(async (): Promise<Blob | null> => {
    const s = stream.current;
    if (!s || !active.current) return null;
    setStatus("listening");
    const rec = new MediaRecorder(s);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    ctx.createMediaStreamSource(s).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let spoke = false;
    let lastLoud = performance.now();
    const started = performance.now();
    rec.start(200);
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (!active.current) return resolve();
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += (v - 128) ** 2;
        const rms = Math.sqrt(sum / data.length);
        const now = performance.now();
        if (rms > 6) { spoke = true; lastLoud = now; }
        if ((spoke && now - lastLoud > 1200) || now - started > 20000) return resolve();
        requestAnimationFrame(tick);
      };
      tick();
    });
    await new Promise<void>((r) => { rec.onstop = () => r(); rec.stop(); });
    void ctx.close();
    return spoke && active.current ? new Blob(chunks, { type: rec.mimeType }) : null;
  }, []);

  const loop = useCallback(async (m: Models) => {
    while (active.current) {
      const blob = await listenOnce();
      if (!active.current) break;
      if (!blob) continue;
      setStatus("thinking");
      const { text } = await m.stt(await toMono16k(blob));
      const said = text.replace(/\[.*?\]|\(.*?\)/g, "").trim();
      if (!said || !active.current) continue;
      setLines((l) => [...l, { role: "user", text: said }]);
      const out = think({ text: said, memories: memories.current, name: userInfo.current?.name });
      const u = userInfo.current;
      if (out.remember && u) {
        memories.current = [out.remember, ...memories.current];
        void supabase.from("memories").insert({ user_id: u.id, content: out.remember });
      }
      if (out.forgetAll && u) {
        memories.current = [];
        void supabase.from("memories").delete().eq("user_id", u.id);
      }
      setLines((l) => [...l, { role: "assistant", text: out.reply }]);
      await speak(m, out.reply);
    }
  }, [listenOnce, speak]);

  const stop = useCallback(() => {
    active.current = false;
    audio.current?.pause();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    if (active.current) return;
    active.current = true;
    setError(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      setStatus("loading");
      const [{ data: auth }, m] = await Promise.all([supabase.auth.getUser(), loadModels(setProgress)]);
      if (auth.user) {
        const [{ data: prof }, { data: mem }] = await Promise.all([
          supabase.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle(),
          supabase.from("memories").select("content").order("created_at", { ascending: false }).limit(50),
        ]);
        userInfo.current = { id: auth.user.id, name: prof?.display_name ?? null };
        memories.current = (mem ?? []).map((r) => r.content);
      }
      setProgress("");
      const first = userInfo.current?.name ? `Hey ${userInfo.current.name.split(" ")[0]}! What's up?` : "Hey! What's up?";
      setLines((l) => [...l, { role: "assistant", text: first }]);
      await speak(m, first);
      await loop(m);
    } catch (e) {
      console.error(e);
      setError(e instanceof DOMException && e.name === "NotAllowedError" ? "Astra needs microphone access to hear you." : "Voice couldn't start. Check your connection and try again.");
      stop();
      setStatus("error");
    }
  }, [loop, speak, stop]);

  useEffect(() => stop, [stop]);

  return { status, progress, lines, error, start, stop };
}
