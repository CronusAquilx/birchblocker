import { createOpenAI } from "@ai-sdk/openai";
import { stepCountIs, streamText, tool, type ModelMessage } from "ai";
import process from "node:process";
import { z } from "zod";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type LiveUser = { supabase: SupabaseClient<Database>; userId: string };
type Artifact =
  | { kind: "website"; url: string; title: string; screenshot: string }
  | { kind: "image"; url: string; prompt: string }
  | { kind: "html"; title: string; html: string }
  | { kind: "code"; filename: string; language: string; code: string };

async function userFromToken(token: string | undefined): Promise<LiveUser | null> {
  if (!token) return null;
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data } = await supabase.auth.getClaims(token);
  const userId = data?.claims?.sub;
  return userId ? { supabase, userId } : null;
}

/** Saved memories + recent chat lines so the voice session knows past conversations. */
async function loadHistory(user: LiveUser | null): Promise<string> {
  if (!user) return "";
  try {
    const [mem, msgs] = await Promise.all([
      user.supabase.from("memories").select("content").eq("user_id", user.userId).order("created_at", { ascending: false }).limit(30),
      user.supabase.from("messages").select("role, parts, created_at").eq("user_id", user.userId).order("created_at", { ascending: false }).limit(40),
    ]);
    const facts = (mem.data ?? []).map((m) => `- ${m.content}`).join("\n");
    const lines = (msgs.data ?? [])
      .reverse()
      .map((m) => {
        const parts = Array.isArray(m.parts) ? (m.parts as { type?: string; text?: string }[]) : [];
        const text = parts
          .filter((p) => p?.type === "text" && typeof p.text === "string")
          .map((p) => p.text!.replace(/<file name="[^"]+">[\s\S]*?<\/file>/g, "[file]"))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 300);
        return text ? `${m.role === "user" ? "User" : "Astra"}: ${text}` : "";
      })
      .filter(Boolean)
      .join("\n");
    let out = "";
    if (facts) out += `\n\nThings you remember about the user:\n${facts}`;
    if (lines) out += `\n\nRecent text-chat history with this user (oldest first). Refer to it naturally when relevant:\n${lines.slice(-5000)}`;
    return out;
  } catch {
    return "";
  }
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function isPublicHttpUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return false;
    const h = u.hostname;
    return !(h === "localhost" || /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h));
  } catch {
    return false;
  }
}

function voiceTools(user: LiveUser | null, config: LiveConfig, signal: AbortSignal, onArtifact: (a: Artifact) => void) {
  return {
    view_website: tool({
      description: "Open a public web page: returns its title and readable text and shows the user a screenshot of it.",
      inputSchema: z.object({ url: z.string() }),
      execute: async ({ url }) => {
        const full = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        if (!isPublicHttpUrl(full)) return { url: full, error: "Only public http(s) URLs are allowed" };
        try {
          const res = await fetch(full, { headers: { "User-Agent": "Mozilla/5.0 (compatible; AstraAgent/1.0)" }, redirect: "follow", signal });
          const html = await res.text();
          const title = stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") || new URL(full).hostname;
          onArtifact({ kind: "website", url: full, title, screenshot: `https://image.thum.io/get/width/1280/crop/900/noanimate/${full}` });
          if (!res.ok) return { url: full, title, error: `Page answered ${res.status}` };
          return { url: full, title, text: stripHtml(html).slice(0, 10000) };
        } catch {
          return { url: full, error: "Could not open that page" };
        }
      },
    }),
    generate_image: tool({
      description: "Create an image from a rich visual description and show it to the user with a download button. Never name real people or copyrighted characters; describe them instead.",
      inputSchema: z.object({ prompt: z.string() }),
      execute: async ({ prompt }) => {
        if (!user) return { error: "Please sign in again to make images." };
        const { generateImagePng } = await import("./astra/image.server");
        const result = await generateImagePng({ baseURL: config.baseURL, apiKey: config.key, model: "openai/gpt-image-2.5-sunburst" }, prompt, signal);
        if (!result.ok) return { error: result.error };
        const path = `${user.userId}/${crypto.randomUUID()}.png`;
        const up = await user.supabase.storage.from("astra-images").upload(path, result.bytes, { contentType: "image/png" });
        if (up.error) return { error: "The image was made but couldn't be saved." };
        const { data } = await user.supabase.storage.from("astra-images").createSignedUrl(path, 60 * 60 * 24 * 365);
        if (!data) return { error: "The image was made but couldn't be saved." };
        onArtifact({ kind: "image", url: data.signedUrl, prompt });
        return { shown: true, prompt };
      },
    }),
    build_html: tool({
      description: "Build a complete, working single-file HTML page or app (inline CSS and JS) and show the user a live preview with download.",
      inputSchema: z.object({ title: z.string(), html: z.string() }),
      execute: async ({ title, html }) => {
        onArtifact({ kind: "html", title, html });
        return { shown: true, title };
      },
    }),
    write_code: tool({
      description: "Write a complete working code file (any language) and show it to the user with copy and download buttons.",
      inputSchema: z.object({ filename: z.string(), language: z.string(), code: z.string() }),
      execute: async ({ filename, language, code }) => {
        onArtifact({ kind: "code", filename, language, code });
        return { shown: true, filename };
      },
    }),
  };
}

export type LiveConfig = {
  baseURL: string;
  key: string;
  liveModel: string;
  backendModel: string;
  openingInstructions?: string;
};

// Fill from co-loaded knowledge: the gateway URL, the Live model and the resolved chat model.
const liveSettings = { baseURL: "https://ai.gateway.lovable.dev/v1", liveModel: "openai/gpt-live-1", backendModel: "openai/gpt-6-astra", openingInstructions: "Greet the user warmly as Astra in one short sentence, then ask what they want to talk about." };

export type LiveSocket = {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onMessage(handler: (data: unknown) => void): void;
  onClose(handler: () => void): void;
  onError(handler: () => void): void;
};

export type LiveExecutionContext = { waitUntil(task: Promise<unknown>): void };
export type LiveConnector = (url: string, headers: Record<string, string>, signal: AbortSignal) => Promise<LiveSocket>;

type WorkerSocket = WebSocket & { accept(): void };
declare const WebSocketPair: { new (): { 0: WorkerSocket; 1: WorkerSocket } };
type Transcript = {
  role: "user" | "assistant";
  text: string;
  start_ms: number;
  end_ms: number;
  listeningSound: boolean;
};
type ProviderEvent = {
  type: string;
  client_event_id?: string;
  error?: { client_event_id?: string; message?: string };
  session?: { id: string };
  delta?: string;
  start_ms?: number;
  end_ms?: number;
  offset_ms?: number;
  delegation?: { id: string; target: string };
};

export function getLiveConfig(): LiveConfig {
  const config: LiveConfig = {
    ...liveSettings,
    key: process.env["LOVABLE_API_KEY"] ?? "",
  };
  if ([config.baseURL, config.key, config.liveModel, config.backendModel].some((value) => !value)) {
    throw new Error("Missing Live relay configuration");
  }
  return config;
}

function gatewayAPIBase(baseURL: string) {
  return `${baseURL.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1`;
}

async function gatewayRejection(response: Response) {
  const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.slice(0, 300) : "";
  return new Error(message || `Voice gateway rejected the connection (${response.status})`);
}

export function validateLiveUpgrade(request: Request, options: { allowMissingOrigin?: boolean } = {}): Response | null {
  const origin = request.headers.get("origin");
  if (origin === null ? !options.allowMissingOrigin : origin !== new URL(request.url).origin) {
    return new Response("Voice connection origin rejected", { status: 403 });
  }
  if (request.method !== "GET" || request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("WebSocket required", { status: 426 });
  }
  return null;
}

function workerSocket(socket: WorkerSocket): LiveSocket {
  return {
    get readyState() {
      return socket.readyState;
    },
    send: (data) => socket.send(data),
    close: (code, reason) => socket.close(code, reason),
    onMessage: (handler) => socket.addEventListener("message", (event) => handler(event.data)),
    onClose: (handler) => socket.addEventListener("close", handler),
    onError: (handler) => socket.addEventListener("error", handler),
  };
}

export function handleLiveRequest(request: Request, token?: string): Response {
  const waitUntil = (request as Request & Partial<LiveExecutionContext>).waitUntil;
  if (!waitUntil) return new Response("Live runtime unavailable", { status: 503 });
  const config = getLiveConfig();
  const rejected = validateLiveUpgrade(request);
  if (rejected) return rejected;
  const pair = new WebSocketPair();
  pair[1].accept();
  bindLiveConnection(workerSocket(pair[1]), config, { waitUntil }, async (url, headers, signal) => {
    const response = await fetch(url, { headers: { ...headers, Upgrade: "websocket" }, signal });
    const socket = (response as Response & { webSocket?: WorkerSocket | null }).webSocket;
    if (!socket) throw await gatewayRejection(response);
    socket.accept();
    return workerSocket(socket);
  }, token);
  const response: ResponseInit & { webSocket: WebSocket } = { status: 101, webSocket: pair[0] };
  return new Response(null, response);
}

const conversationInstructions = `You are Astra, a friendly, quick-witted AI assistant having a spoken conversation, like ChatGPT voice mode.
Speak naturally and casually in English with brief replies. Ask a focused question when details are unclear.
Backchannel policy: Use moderate listening sounds without taking over.
Interruption policy: Stop your answer and listen when the user interrupts.
Delegation policy:
Backend tools: Careful reasoning, opening and reading websites (with screenshots), making images, building working HTML pages/apps and writing code files, looking closely at images the user shared, and drafting study schedules.
Delegate to the backend when: The user asks you to look at / open / check a website or link, make or draw a picture, build or code anything,
asks details about an image or file they shared, or needs careful reasoning, math, or a study schedule,
or a correction changes a question already being worked on.
Do not delegate to the backend when: Casual chat, simple questions, greeting, clarifying a question, or repeating
a still-current answer. Wait for the backend result before presenting its answer.
When something was built or made, tell the user it's on screen with Preview and Download buttons; never read code aloud.
The user can also type messages, paste links and share images in a chat box; those arrive as instructions starting with "The user shared".`;

const studyScheduleInput = z
  .object({
    total_minutes: z.number().int().min(1).max(10_080),
    days: z.number().int().min(1).max(30),
  })
  .strict();

function planStudySchedule(args: z.infer<typeof studyScheduleInput>) {
  const daily = Math.floor(args.total_minutes / args.days);
  return {
    total_minutes: args.total_minutes,
    days: args.days,
    sessions: Array.from({ length: args.days }, (_, index) => ({
      day: index + 1,
      minutes: daily + (index < args.total_minutes % args.days ? 1 : 0),
    })),
  };
}

function isListeningSound(text: string) {
  const normalized = text.toLowerCase().replace(/[\s\p{Pd}]/gu, "");
  return /^(?:m+hm+|uhhuh)[.,!]*$/.test(normalized);
}

async function answerQuestion(
  messages: ModelMessage[],
  config: LiveConfig,
  correlation: { runID: string; sessionID: string | undefined; delegationID: string },
  signal: AbortSignal,
  consumeInput: () => void,
  onPlan: (plan: ReturnType<typeof planStudySchedule>) => void,
  extras: { user: LiveUser | null; onArtifact: (a: Artifact) => void } = { user: null, onArtifact: () => {} },
) {
  signal.throwIfAborted();
  const provider = createOpenAI({
    baseURL: gatewayAPIBase(config.baseURL),
    apiKey: config.key,
    headers: {
      "Lovable-API-Key": config.key,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
  let responseCursor = 0;
  consumeInput();
  const result = streamText({
    model: provider.responses(config.backendModel),
    abortSignal: signal,
    maxRetries: 0,
    stopWhen: stepCountIs(50),
    includeRawChunks: true,
    prepareStep() {
      consumeInput();
      return { messages: [...messages] };
    },
    onStepFinish(step) {
      messages.push(...step.response.messages.slice(responseCursor));
      responseCursor = step.response.messages.length;
    },
    headers: {
      "X-Lovable-AIG-Run-ID": correlation.runID,
      "X-Lovable-AIG-Metadata": JSON.stringify({
        live_session_id: correlation.sessionID,
        delegation_id: correlation.delegationID,
      }),
    },
    providerOptions: {
      openai: {
        store: false,
        ...(config.backendModel !== "openai/chat-latest"
          ? {
              forceReasoning: true,
              reasoningEffort: "medium",
              reasoningSummary: "auto",
              include: ["reasoning.encrypted_content"],
            }
          : {}),
      },
    },
    system:
      "Help a spoken learning companion answer the latest user question. " +
      "Transcripts may be incomplete or corrected. Use the latest correction. " +
      "Continue from completed tool results; do not repeat completed actions. " +
      "Return verified facts and useful next steps in at most 150 words. " +
      "To display a study schedule for the current request, call plan_study_schedule with its total minutes and days. " +
      "To open a website or link use view_website. To make a picture use generate_image. To build a page, game or app use build_html " +
      "(complete working single file). For other code use write_code. Those tools show results on the user's screen with preview/download; " +
      "your answer is spoken aloud, so summarize briefly and never include code in it. Images the user shared are in the conversation; look at them closely.",
    messages,
    tools: {
      ...voiceTools(extras.user, config, signal, extras.onArtifact),
      plan_study_schedule: tool({
        description: "Distribute a total study time evenly across days and return a draft schedule.",
        inputSchema: studyScheduleInput,
        execute: async (args) => {
          signal.throwIfAborted();
          const plan = planStudySchedule(args);
          onPlan(plan);
          return plan;
        },
      }),
    },
  });
  let completed = false;
  let stepCompleted = false;
  let failed = false;
  // Drain through HTTP EOF so successful work is not recorded as cancelled by the Gateway.
  for await (const part of result.fullStream) {
    if (part.type === "start-step") stepCompleted = false;
    if (part.type === "raw" && part.rawValue && typeof part.rawValue === "object" && "type" in part.rawValue) {
      if (part.rawValue.type === "response.completed") stepCompleted = true;
      if (part.rawValue.type === "response.failed" || part.rawValue.type === "response.incomplete") failed = true;
    }
    if (part.type === "finish-step" && !stepCompleted) failed = true;
    if (part.type === "error" || part.type === "abort") failed = true;
    if (part.type === "finish") completed = part.finishReason === "stop";
  }
  signal.throwIfAborted();
  if (failed || !completed) throw new Error("The backend response did not complete");
  const answer = await result.text;
  if (!answer.trim()) throw new Error("The backend response had no answer");
  return answer;
}

function* commentaryChunks(content: string) {
  const encoder = new TextEncoder();
  let chunk = "";
  let bytes = 0;
  for (const [word] of content.matchAll(/\S+\s*|\s+/gu)) {
    // Chunks stay well inside the provider's per-append size limit.
    if (chunk && bytes + encoder.encode(word).length > 480) {
      yield chunk;
      chunk = "";
      bytes = 0;
    }
    for (const character of word) {
      const size = encoder.encode(character).length;
      if (bytes + size > 480) {
        yield chunk;
        chunk = "";
        bytes = 0;
      }
      chunk += character;
      bytes += size;
    }
  }
  if (chunk) yield chunk;
}

export function bindLiveConnection(
  browser: LiveSocket,
  configuration: LiveConfig,
  execution: LiveExecutionContext,
  connect: LiveConnector,
  token?: string,
): void {
  const config = { ...configuration };
  const userPromise = userFromToken(token).catch(() => null);
  const runID = crypto.randomUUID();
  const setupAbort = new AbortController();
  let gateway: LiveSocket | undefined;
  let sessionID: string | undefined;
  let starting = false;
  let closing = false;
  let finished = false;
  let revision = 0;
  let task: AbortController | undefined;
  const pendingDelegations: Array<{
    event: ProviderEvent;
    plan?: ReturnType<typeof planStudySchedule>;
  }> = [];
  let completedDelegation: (typeof pendingDelegations)[number] | undefined;
  const backendMessages: ModelMessage[] = [];
  let transcriptCursor = 0;
  let restartTimer: ReturnType<typeof setTimeout> | undefined;
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let finishDrain: (() => void) | undefined;
  let browserReady = false;
  let greetingRequested = false;
  let greetingCommand: { id: string; type: "instructions" | "commentary" } | undefined;
  let greetingTimer: ReturnType<typeof setTimeout> | undefined;
  const startTimer = setTimeout(() => {
    emit({ type: "app.error", error: { message: "Voice startup message timed out" } });
    stop();
  }, 5000);
  const transcripts: Transcript[] = [];
  const delegations = new Set<string>();

  function emit(event: object) {
    if (browser.readyState !== 1) return;
    try {
      browser.send(JSON.stringify(event));
    } catch {
      stop();
    }
  }

  function close(socket?: LiveSocket) {
    if (!socket || socket.readyState === 3) return;
    try {
      socket.close(1000, "Call ended");
    } catch {
      return;
    }
  }

  function clearGreeting() {
    clearTimeout(greetingTimer);
    greetingCommand = undefined;
  }

  function requestGreeting() {
    const content = (
      config.openingInstructions ??
      "Start the conversation now in your configured language and role. Give a brief greeting suited to this app's purpose, ask one relevant opening question, then listen."
    ).trim();
    if (!content || !browserReady || !sessionID || greetingRequested || closing) return;
    greetingRequested = true;
    if (new TextEncoder().encode(content).length > 480) {
      emit({ type: "app.greeting.error", error: { message: "The opening instructions are too long" } });
      return;
    }
    greetingCommand = { id: crypto.randomUUID(), type: "instructions" };
    greetingTimer = setTimeout(() => {
      clearGreeting();
      emit({ type: "app.greeting.error", error: { message: "The opening could not be confirmed" } });
    }, 10_000);
    gateway?.send(
      JSON.stringify({
        type: "session.instructions.append",
        event_id: greetingCommand.id,
        delegation_id: null,
        content,
      }),
    );
  }

  function discardPendingWork() {
    pendingDelegations.length = 0;
    completedDelegation = undefined;
    clearTimeout(restartTimer);
    task?.abort();
  }

  function finish() {
    if (finished) return;
    finished = closing = true;
    clearTimeout(startTimer);
    clearTimeout(startupTimer);
    clearTimeout(closeTimer);
    clearTimeout(restartTimer);
    clearGreeting();
    discardPendingWork();
    setupAbort.abort();
    close(gateway);
    close(browser);
    finishDrain?.();
  }

  function stop() {
    if (closing) return;
    closing = true;
    discardPendingWork();
    clearTimeout(startupTimer);
    clearTimeout(startTimer);
    clearGreeting();
    if (gateway?.readyState === 1) {
      execution.waitUntil(
        new Promise<void>((resolve) => {
          finishDrain = resolve;
        }),
      );
      closeTimer = setTimeout(finish, 15_000);
      try {
        gateway.send(JSON.stringify({ type: "session.close" }));
      } catch {
        finish();
      }
    } else {
      finish();
    }
  }

  function scheduleDelegation() {
    clearTimeout(restartTimer);
    if (closing || task || pendingDelegations.length === 0) return;
    restartTimer = setTimeout(() => void runDelegation(), 300);
  }

  function deliverResult(delegationID: string, answer: string, plan?: ReturnType<typeof planStudySchedule>) {
    if (closing) return;
    if (gateway?.readyState !== 1) return stop();
    try {
      for (const content of commentaryChunks(answer)) {
        gateway.send(
          JSON.stringify({
            type: "session.commentary.append",
            event_id: crypto.randomUUID(),
            delegation_id: delegationID,
            content,
          }),
        );
      }
      if (plan) emit({ type: "app.study_schedule.plan", delegation_id: delegationID, plan });
      completedDelegation = pendingDelegations.shift();
    } catch {
      stop();
    }
  }

  async function runDelegation() {
    const pending = pendingDelegations[0];
    const event = pending?.event;
    const id = event?.delegation?.id;
    if (!pending || !event || !id || closing || task) return;
    if (!transcripts.some(({ role, text }) => role === "user" && text.trim())) return;
    const controller = new AbortController();
    task = controller;
    let taskRevision = revision;
    try {
      const answer = await answerQuestion(
        backendMessages,
        config,
        { runID, sessionID, delegationID: id },
        controller.signal,
        () => {
          const updates = transcripts.slice(transcriptCursor);
          if (updates.some(({ role, listeningSound }) => role === "user" && !listeningSound)) delete pending.plan;
          backendMessages.push(...updates.map(({ role, text }) => ({ role, content: text })));
          transcriptCursor = transcripts.length;
          taskRevision = revision;
        },
        (plan) => {
          pending.plan = plan;
        },
        { user: await userPromise, onArtifact: (artifact) => emit({ type: "app.artifact", artifact }) },
      );
      if (closing || controller.signal.aborted) return;
      if (taskRevision !== revision) return;
      deliverResult(id, answer.trim(), pending.plan);
    } catch {
      if (closing || controller.signal.aborted) return;
      backendMessages.push({
        role: "assistant",
        content:
          "The backend attempt failed. Completed tool results remain valid; verify uncertain external actions before any retry.",
      });
      if (taskRevision !== revision) return;
      deliverResult(id, "The backend could not finish the answer. Ask whether the user wants to try again.");
    } finally {
      if (task === controller) task = undefined;
      scheduleDelegation();
    }
  }

  function tellLive(content: string) {
    if (gateway?.readyState !== 1) return;
    for (const chunk of commentaryChunks(content)) {
      gateway.send(JSON.stringify({ type: "session.instructions.append", event_id: crypto.randomUUID(), delegation_id: null, content: chunk }));
    }
  }

  async function shareContext(event: { text?: unknown; image?: unknown; name?: unknown }) {
    const text = typeof event.text === "string" ? event.text.slice(0, 20000).trim() : "";
    const image = typeof event.image === "string" && /^data:image\/[a-z+.-]+;base64,/i.test(event.image) ? event.image : "";
    const name = typeof event.name === "string" ? event.name.slice(0, 120) : "image";
    if (!text && !image) return;
    if (image) {
      backendMessages.push({ role: "user", content: [{ type: "text", text: `I shared an image (${name}).${text ? ` ${text}` : ""}` }, { type: "image", image }] });
      const provider = createOpenAI({ baseURL: gatewayAPIBase(config.baseURL), apiKey: config.key, headers: { "Lovable-API-Key": config.key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" } });
      const result = streamText({
        model: provider.responses(config.backendModel),
        maxRetries: 0,
        headers: { "X-Lovable-AIG-Run-ID": runID },
        providerOptions: { openai: { store: false, forceReasoning: true, reasoningEffort: "low" } },
        messages: [{ role: "user", content: [{ type: "text", text: "Describe this image in 2-3 sentences for a voice assistant, including any visible text." }, { type: "image", image }] }],
      });
      for await (const _ of result.fullStream) { /* drain */ }
      const description = (await result.text).trim();
      if (closing) return;
      tellLive(`The user shared an image (${name})${text ? ` and said: "${text.slice(0, 300)}"` : ""}. It shows: ${description} Briefly react to it out loud.`);
    } else {
      backendMessages.push({ role: "user", content: `I typed this in the chat box: ${text}` });
      const hasLink = /https?:\/\/|www\.|\.[a-z]{2,}\//i.test(text);
      tellLive(`The user shared in the chat box: "${text.slice(0, 1200)}"${hasLink ? " (it includes a link you can open with the backend)" : ""}. Respond to it out loud.`);
    }
    emit({ type: "app.context.ack" });
  }

  function queueDelegation(event: ProviderEvent) {
    pendingDelegations.push({ event });
    emit({ type: "app.delegation.pending", delegation_id: event.delegation?.id });
    scheduleDelegation();
  }

  function receiveGateway(data: unknown) {
    try {
      if (typeof data !== "string" || data.length > 1024 * 1024) throw new Error("Invalid voice event");
      const event: ProviderEvent = JSON.parse(data);
      if (browser.readyState === 1) browser.send(data);
      if (event.type === "session.closed") return finish();
      if (event.type === "gateway.session.closing" || event.type === "gateway.error" || event.type === "app.error") {
        return stop();
      }
      if (closing) return;
      if (event.type === "gateway.session.created") {
        sessionID = event.session?.id;
        clearTimeout(startupTimer);
        requestGreeting();
      }
      if (
        greetingCommand &&
        event.type === `session.${greetingCommand.type}.appended` &&
        event.client_event_id === greetingCommand.id
      ) {
        if (greetingCommand.type === "instructions") {
          greetingCommand = { id: crypto.randomUUID(), type: "commentary" };
          gateway?.send(
            JSON.stringify({
              type: "session.commentary.append",
              event_id: greetingCommand.id,
              delegation_id: null,
              content: "Begin the conversation now, following the instructions provided.",
            }),
          );
        } else {
          clearGreeting();
          emit({ type: "app.greeting.accepted" });
        }
      } else if (greetingCommand && event.type === "error" && event.error?.client_event_id === greetingCommand.id) {
        clearGreeting();
        emit({ type: "app.greeting.error", error: { message: event.error.message ?? "The opening was rejected" } });
      }
      if (event.type === "session.input_transcript.delta" || event.type === "session.output_transcript.delta") {
        const role = event.type === "session.input_transcript.delta" ? "user" : "assistant";
        if (!event.delta?.trim()) return;
        const listeningSound = role === "user" && Boolean(task) && isListeningSound(event.delta);
        transcripts.push({
          role,
          text: event.delta,
          start_ms: event.start_ms ?? 0,
          end_ms: event.end_ms ?? 0,
          listeningSound,
        });
        if (listeningSound) return;
        if (role === "user") {
          revision++;
          const offset = completedDelegation?.event.offset_ms;
          // Live has no transcript watermark; completed handoffs can receive late context.
          if (
            pendingDelegations.length === 0 &&
            completedDelegation &&
            typeof offset === "number" &&
            Number.isFinite(offset) &&
            offset >= 0 &&
            typeof event.start_ms === "number" &&
            Number.isFinite(event.start_ms) &&
            event.start_ms >= 0 &&
            event.start_ms <= offset
          ) {
            pendingDelegations.push(completedDelegation);
            completedDelegation = undefined;
          }
          if (pendingDelegations.length) {
            emit({ type: "app.delegation.pending", delegation_id: pendingDelegations[0]?.event.delegation?.id });
          }
        }
        scheduleDelegation();
      } else if (event.type === "session.delegation.created") {
        const id = event.delegation?.id;
        if (id && event.delegation?.target === "client" && !delegations.has(id)) {
          delegations.add(id);
          queueDelegation(event);
        }
      }
    } catch {
      emit({ type: "app.error", error: { message: "Invalid voice event or lost connection" } });
      stop();
    }
  }

  async function startSession(sdp: string) {
    if (closing || browser.readyState !== 1) return;
    clearTimeout(startTimer);
    startupTimer = setTimeout(() => {
      emit({ type: "app.error", error: { message: "Voice startup timed out" } });
      stop();
    }, 40_000);
    const accepted = await connect(
      new URL(`${gatewayAPIBase(config.baseURL)}/live/sessions`).href,
      {
        "Lovable-API-Key": config.key,
        "X-Lovable-AIG-SDK": "fetch",
        "X-Lovable-AIG-Run-ID": runID,
      },
      setupAbort.signal,
    );
    if (closing || browser.readyState !== 1) {
      close(accepted);
      return;
    }
    const history = await loadHistory(await userPromise);
    if (closing || browser.readyState !== 1) {
      close(accepted);
      return;
    }
    gateway = accepted;
    gateway.onMessage(receiveGateway);
    gateway.onClose(finish);
    gateway.onError(() => {
      emit({ type: "app.error", error: { message: "Voice gateway connection failed" } });
      stop();
    });
    gateway.send(
      JSON.stringify({
        type: "session.start",
        session: {
          model: config.liveModel,
          instructions: conversationInstructions + history,
          audio: { output: { voice: "marin" } },
          delegation: { type: "client" },
        },
        transport: { type: "webrtc", sdp },
      }),
    );
  }

  browser.onMessage((data) => {
    try {
      if (typeof data !== "string" || data.length > 4 * 1024 * 1024) throw new Error("Invalid client message");
      const event = JSON.parse(data);
      if (event.type === "session.close") return stop();
      if (closing) return;
      if (!gateway) {
        if (starting || event.type !== "app.start" || typeof event.sdp !== "string" || !event.sdp.trim()) {
          throw new Error("Voice startup message required");
        }
        starting = true;
        execution.waitUntil(
          startSession(event.sdp).catch((error) => {
            if (!closing)
              emit({
                type: "app.error",
                error: { message: error instanceof Error ? error.message : "Voice startup failed" },
              });
            stop();
          }),
        );
        return;
      }
      if (event.type === "app.ready") {
        browserReady = true;
        requestGreeting();
        return;
      }
      if (event.type === "app.context") {
        execution.waitUntil(shareContext(event).catch(() => emit({ type: "app.context.error", error: { message: "Astra couldn't read that" } })));
        return;
      }
      if (event.type !== "gateway.heartbeat") {
        throw new Error("Unsupported client event");
      }
      if (gateway.readyState !== 1) return stop();
      gateway.send(data);
    } catch {
      emit({ type: "app.error", error: { message: "Voice connection could not be started or continued" } });
      stop();
    }
  });
  browser.onClose(stop);
  browser.onError(stop);
}
