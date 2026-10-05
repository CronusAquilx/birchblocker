/**
 * Image generation through the Lovable AI Gateway. Server-only.
 * Streams the SSE body and resolves to the final PNG bytes; a stream that ends
 * with zero events is replayed once without streaming (same model and prompt).
 */

export type ImageConfig = {
  baseURL: string;
  apiKey: string;
  model: string;
};

function generationBody(config: ImageConfig, prompt: string, stream: boolean) {
  return {
    model: config.model,
    prompt,
    ...(stream ? { partial_images: 0, stream: true } : {}),
  };
}

function requestImage(config: ImageConfig, prompt: string, stream: boolean, signal?: AbortSignal) {
  const base = config.baseURL.replace(/\/+$/, "").replace(/\/v1$/, "");
  return fetch(`${base}/v1/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(generationBody(config, prompt, stream)),
    signal: signal ?? null,
  });
}

type StreamResult =
  | { ok: true; b64: string }
  | { ok: false; error: string; retryable?: boolean };

async function consumeImageStream(response: Response): Promise<StreamResult> {
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let b64: string | null = null;
  let errorText: string | null = null;
  let events = 0;

  const handlePayload = (payload: unknown) => {
    events++;
    const data = payload as {
      type?: string;
      b64_json?: string;
      data?: { b64_json?: string }[];
      error?: { message?: string };
    };
    if (data?.type === "error" || data?.error) {
      errorText = data.error?.message ?? "The image request was rejected";
      return;
    }
    if (data?.type === "image_generation.completed" && data.b64_json) b64 = data.b64_json;
    if (data?.type === "image_edit.completed" && data.b64_json) b64 = data.b64_json;
  };

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      buffer += decoder.decode(next.value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        for (const line of block.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === "[DONE]") continue;
          try {
            handlePayload(JSON.parse(raw));
          } catch {
            /* ignore malformed frames */
          }
        }
      }
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    return { ok: false, error: "The image stream ended unexpectedly", retryable: true };
  } finally {
    reader.releaseLock();
  }

  if (errorText) return { ok: false, error: errorText };
  if (b64) return { ok: true, b64 };
  if (events === 0) return { ok: false, error: "__replay__" };
  return { ok: false, error: "The image came back incomplete", retryable: true };
}

/**
 * Generates an image and resolves to PNG bytes. Errors carry a user-facing
 * message; content-policy rejections are terminal and must not be retried.
 */
export async function generateImagePng(
  config: ImageConfig,
  prompt: string,
  signal?: AbortSignal,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }> {
  let res = await requestImage(config, prompt, true, signal);
  if (!res.ok || !res.body) {
    return { ok: false, error: res.ok ? "The image stream was empty" : `Image server answered ${res.status}` };
  }
  let result = await consumeImageStream(res);
  if (result.ok) {
    const bin = atob(result.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { ok: true, bytes };
  }
  if (result.error === "__replay__") {
    // Zero-event stream: replay the same request once, without streaming.
    res = await requestImage(config, prompt, false, signal);
    if (!res.ok) return { ok: false, error: `Image server answered ${res.status}` };
    const json = (await res.json().catch(() => null)) as { data?: { b64_json?: string }[]; error?: { message?: string } } | null;
    const b64 = json?.data?.[0]?.b64_json;
    if (b64) {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { ok: true, bytes };
    }
    return { ok: false, error: json?.error?.message ?? "The image came back empty" };
  }
  return { ok: false, error: result.error };
}
