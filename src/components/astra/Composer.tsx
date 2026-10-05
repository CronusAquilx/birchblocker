import { useEffect, useRef, useState } from "react";
import { ArrowUp, AudioLines, Loader2, Mic, Paperclip, Square, X } from "lucide-react";
import { toast } from "sonner";
import { ModelPicker } from "./ModelPicker";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { FileUIPart } from "ai";
import { MAX_FILES, MAX_FILE_BYTES, readAttachment, type Attachment } from "@/lib/astra/files";
import { recordWav, transcribeAudio } from "@/lib/astra/voice";

type Props = {
  onSend: (text: string, images?: FileUIPart[]) => void;
  onStop?: () => void;
  busy?: boolean;
  modelId: string;
  reasoning: string;
  onModel: (id: string) => void;
  onReasoning: (id: string) => void;
  autoFocusKey?: unknown;
};

export function Composer({ onSend, onStop, busy, modelId, reasoning, onModel, onReasoning, autoFocusKey }: Props) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [reading, setReading] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<{ stop: () => Promise<File> } | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  async function stopAndTranscribe() {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    setRecording(false);
    if (!recorder) return;
    setTranscribing(true);
    try {
      const file = await recorder.stop();
      const transcript = await transcribeAudio(file);
      if (transcript) setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
      else toast.error("Didn't catch any speech — try again");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Voice input failed");
    } finally {
      setTranscribing(false);
    }
  }

  async function toggleMic() {
    if (recording) {
      await stopAndTranscribe();
      return;
    }
    try {
      const recorder = await recordWav();
      recorderRef.current = recorder;
      setRecording(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Microphone is unavailable");
    }
  }

  async function addFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (fileRef.current) fileRef.current.value = "";
    const room = MAX_FILES - files.length;
    if (picked.length > room) toast.error(`You can attach up to ${MAX_FILES} files at a time.`);
    for (const f of picked.slice(0, Math.max(0, room))) {
      if (f.size > MAX_FILE_BYTES) {
        toast.error(`${f.name} is too large (max 50 MB)`);
        continue;
      }
      setReading((n) => n + 1);
      try {
        const att = await readAttachment(f);
        setFiles((prev) => (prev.length >= MAX_FILES ? prev : [...prev, att]));
      } catch (e) {
        toast.error(`${f.name}: ${e instanceof Error ? e.message : "couldn't be read"}`);
      } finally {
        setReading((n) => n - 1);
      }
    }
  }

  useEffect(() => {
    ref.current?.focus();
  }, [autoFocusKey, busy]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  function submit() {
    const t = text.trim();
    if ((!t && !files.length) || busy) return;
    if (reading) return;
    const attached = files.flatMap((f) => (f.kind === "text" ? [f] : [])).map((f) => `<file name="${f.name.replace(/"/g, "")}">\n${f.content}\n</file>`).join("\n\n");
    const images = files.flatMap((f) => (f.kind === "image" ? [f.part] : []));
    onSend(attached ? `${attached}\n\n${t}` : t || (images.length ? "Take a look at these." : ""), images.length ? images : undefined);
    setText("");
    setFiles([]);
  }

  return (
    <div className="rounded-lg border bg-card shadow-[0_8px_30px_-12px_color-mix(in_oklch,var(--star)_18%,transparent)] focus-within:border-ring/60">
      {(files.length > 0 || reading > 0) && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-3">
          {files.map((f, i) => (
            <span key={i} className="flex items-center gap-1 rounded-sm border bg-muted px-2 py-0.5 text-xs">
              {f.kind === "image" && <img src={f.part.url} alt="" className="size-5 rounded-sm object-cover" />}
              {f.name}
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                <X className="size-3" />
              </button>
            </span>
          ))}
          {reading > 0 && <span className="px-2 py-0.5 text-xs text-muted-foreground">Reading {reading} file{reading > 1 ? "s" : ""}…</span>}
        </div>
      )}
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        placeholder="Ask Astra anything…"
        className="block w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[15px] outline-none placeholder:text-muted-foreground"
      />
      <div className="flex items-center gap-2 px-2 pb-2">
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} />
        <button onClick={() => fileRef.current?.click()} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Attach files">
          <Paperclip className="size-4" />
        </button>
        {transcribing ? (
          <span className="flex items-center gap-1.5 rounded-md p-1.5 text-xs text-muted-foreground" aria-live="polite">
            <Loader2 className="size-4 animate-spin text-star" /> Transcribing…
          </span>
        ) : (
          <button
            onClick={toggleMic}
            className={cn(
              "rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground",
              recording && "bg-destructive/15 text-destructive hover:bg-destructive/20",
            )}
            aria-label={recording ? "Stop recording" : "Voice input"}
          >
            <Mic className={cn("size-4", recording && "animate-pulse")} />
          </button>
        )}
        <ModelPicker modelId={modelId} reasoning={reasoning} onModel={onModel} onReasoning={onReasoning} />
        <div className="flex-1" />
        <Link to="/voice" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Voice mode" title="Talk to Astra">
          <AudioLines className="size-4" />
        </Link>
        {busy ? (
          <button onClick={onStop} className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground" aria-label="Stop">
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!text.trim() && !files.length}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-md bg-star text-star-foreground transition-opacity",
              !text.trim() && !files.length && "opacity-35",
            )}
            aria-label="Send"
          >
            <ArrowUp className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
