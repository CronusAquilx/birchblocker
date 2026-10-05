import { useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { UIMessage } from "ai";
import { Check, ChevronRight, Copy, Download, ExternalLink, Loader2, Maximize2, Square, Volume2, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { AstraMark } from "./Mark";
import { streamSpeech } from "@/lib/astra/voice";
import { cn } from "@/lib/utils";

type ToolPart = {
  type: string;
  toolCallId: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorText?: string;
};

const TOOL_LABELS: Record<string, string> = {
  calculator: "Calculated",
  datetime: "Checked the time",
  web_search: "Searched the web",
  url_fetch: "Read a page",
  remember: "Saved to memory",
  html_preview: "Built a page",
  generate_image: "Generated an image",
};

function SpeakButton({ text }: { text: string }) {
  const [playing, setPlaying] = useState(false);
  const ctrlRef = useRef<AbortController | null>(null);
  const spoken = text.slice(0, 4000);
  async function toggle() {
    if (playing) {
      ctrlRef.current?.abort();
      ctrlRef.current = null;
      setPlaying(false);
      return;
    }
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setPlaying(true);
    try {
      await streamSpeech("/api/speech", spoken, ctrl.signal);
    } catch (e) {
      const aborted = e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
      if (!aborted) toast.error("Couldn't play that reply. Tap to try again.");
    } finally {
      if (ctrlRef.current === ctrl) {
        ctrlRef.current = null;
        setPlaying(false);
      }
    }
  }
  if (!spoken.trim()) return null;
  return (
    <button
      onClick={toggle}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground",
        playing && "border-star/60 text-star",
      )}
      aria-label={playing ? "Stop reading aloud" : "Read aloud"}
    >
      {playing ? <Square className="size-3 fill-current" /> : <Volume2 className="size-3.5" />}
      {playing ? "Stop" : "Listen"}
    </button>
  );
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const text = extractText(children);
  return (
    <div className="group relative">
      <button
        onClick={() => {
          navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute top-2 right-2 rounded-sm border bg-background/80 p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
        aria-label="Copy code"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
      <pre>{children}</pre>
    </div>
  );
}

function extractText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object" && "props" in node) return extractText((node as { props: { children?: ReactNode } }).props.children);
  return "";
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="astra-prose min-w-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function HtmlPreview({ title, html }: { title: string; html: string }) {
  const [full, setFull] = useState(false);
  const frame = (
    <iframe title={title} srcDoc={html} sandbox="allow-scripts allow-forms allow-modals" className="h-full w-full bg-white" />
  );
  return (
    <>
      <div className="overflow-hidden rounded-lg border">
        <div className="flex items-center gap-2 border-b bg-card px-3 py-2">
          <span className="size-2 rounded-full bg-star" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
          <button
            onClick={() => {
              const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
              window.open(url, "_blank");
            }}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Open in new tab"
          >
            <ExternalLink className="size-4" />
          </button>
          <button onClick={() => setFull(true)} className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Fullscreen">
            <Maximize2 className="size-4" />
          </button>
        </div>
        <div className="h-80 md:h-96">{frame}</div>
      </div>
      {full && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center gap-2 border-b px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
            <button onClick={() => setFull(false)} className="rounded p-1.5 hover:bg-accent" aria-label="Close">
              <X className="size-5" />
            </button>
          </div>
          <div className="flex-1">{frame}</div>
        </div>
      )}
    </>
  );
}

function ToolView({ part }: { part: ToolPart }) {
  const [open, setOpen] = useState(false);
  const name = part.type.replace(/^tool-/, "");
  const running = part.state === "input-streaming" || part.state === "input-available";
  const failed = part.state === "output-error" || Boolean(part.output?.["error"]);
  const out = part.output;

  if (name === "html_preview" && part.input?.["html"] && !running) {
    return <HtmlPreview title={String(part.input["title"] ?? "Preview")} html={String(part.input["html"])} />;
  }

  if (name === "generate_image" && !running) {
    const url = typeof out?.["url"] === "string" ? out["url"] : null;
    const prompt = String(part.input?.["prompt"] ?? "Image");
    if (url) {
      return (
        <div>
          <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <Check className="size-3.5 text-success" />
            <span>{TOOL_LABELS[name]} · {prompt.length > 60 ? `${prompt.slice(0, 60)}…` : prompt}</span>
            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
          </button>
          <div className="mt-2 w-fit max-w-sm overflow-hidden rounded-lg border">
            <img src={url} alt={prompt} className="block max-w-full" loading="lazy" />
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              download
              className="flex items-center justify-center gap-1.5 border-t py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Download className="size-3" /> Download
            </a>
          </div>
          {open && (
            <pre className="mt-2 max-h-64 overflow-auto rounded-md border bg-card p-3 font-mono text-xs text-muted-foreground">
              {JSON.stringify({ prompt, url }, null, 2)}
            </pre>
          )}
        </div>
      );
    }
  }

  const results = name === "web_search" ? ((out?.["results"] as { title: string; url: string }[] | undefined) ?? []) : [];

  return (
    <div className="text-sm">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
        {running ? (
          <Loader2 className="size-3.5 animate-spin text-star" />
        ) : failed ? (
          <AlertCircle className="size-3.5 text-destructive" />
        ) : (
          <Check className="size-3.5 text-success" />
        )}
        <span>
          {running ? `Using ${name.replace("_", " ")}…` : TOOL_LABELS[name] ?? name}
          {part.input?.["query"] ? <span className="text-foreground/70"> · {String(part.input["query"])}</span> : null}
          {part.input?.["url"] ? <span className="text-foreground/70"> · {String(part.input["url"])}</span> : null}
        </span>
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
      </button>
      {results.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {results.slice(0, 5).map((r) => (
            <a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="max-w-56 truncate rounded-sm border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground">
              {new URL(r.url).hostname.replace(/^www\./, "")}
            </a>
          ))}
        </div>
      )}
      {open && (
        <pre className="mt-2 max-h-64 overflow-auto rounded-md border bg-card p-3 font-mono text-xs text-muted-foreground">
          {JSON.stringify({ input: part.input, output: part.output ?? part.errorText }, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function MessageView({ message }: { message: UIMessage }) {
  if (message.role === "user") {
    const text = message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");
    const files = text.match(/^<file name="([^"]+)">/gm)?.map((m) => m.slice(12, -2)) ?? [];
    const visible = text.replace(/<file name="[^"]+">[\s\S]*?<\/file>\n*/g, "").trim();
    const images = message.parts.filter((p) => p.type === "file" && p.mediaType.startsWith("image/")) as { url: string; filename?: string }[];
    return (
      <div className="flex flex-col items-end gap-1.5 animate-rise">
        {images.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
            {images.map((im, i) => (
              <img key={i} src={im.url} alt={im.filename ?? "photo"} className="size-24 rounded-md border object-cover" />
            ))}
          </div>
        )}
        {files.map((f) => (
          <span key={f} className="rounded-sm border px-2 py-0.5 label-mono">{f}</span>
        ))}
        {visible && <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-bubble px-4 py-2.5 text-[15px] text-bubble-foreground">{visible}</div>}
      </div>
    );
  }
  return (
    <div className="flex gap-3 animate-rise">
      <AstraMark className="mt-1 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-3">
        {message.parts.map((p, i) => {
          if (p.type === "text") return <Markdown key={i} text={p.text} />;
          if (p.type.startsWith("tool-")) return <ToolView key={i} part={p as unknown as ToolPart} />;
          return null;
        })}
        {message.parts.some((p) => p.type === "text" && p.text.trim()) && (
          <SpeakButton text={message.parts.filter((p) => p.type === "text").map((p) => p.text).join(" ")} />
        )}
      </div>
    </div>
  );
}

export function Thinking() {
  return (
    <div className="flex items-center gap-3">
      <AstraMark className="size-4" pulsing />
      <span className="text-sm text-muted-foreground">Astra is thinking…</span>
    </div>
  );
}
