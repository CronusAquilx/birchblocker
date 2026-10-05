import { supabase } from "@/integrations/supabase/client";

type RawHeaders = [string, string][];
const NULL_BODY = new Set([101, 103, 204, 205, 304]);

/**
 * Proxy transport that sends every request to Astra's own server (/api/proxy),
 * so the browser never contacts the target site or a third-party Wisp server.
 */
export class AstraRelayTransport {
  ready = false;
  async init() { this.ready = true; }

  async request(remote: URL, method: string, body: BodyInit | null, headers: RawHeaders, signal: AbortSignal | undefined) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? "";
    const payload = body == null || method === "GET" || method === "HEAD" ? null : await new Response(body).arrayBuffer();
    const res = await fetch("/api/proxy", {
      method: "POST",
      signal: signal ?? null,
      headers: {
        authorization: `Bearer ${token}`,
        "x-astra-url": remote.href,
        "x-astra-method": method,
        "x-astra-headers": encodeURIComponent(JSON.stringify(headers ?? [])),
        "content-type": "application/octet-stream",
      },
      body: payload,
    });
    const statusHeader = res.headers.get("x-astra-status");
    if (!statusHeader) {
      const text = await res.text().catch(() => "");
      throw new Error(`Astra relay error ${res.status}: ${text.slice(0, 200)}`);
    }
    const status = Number(statusHeader);
    let outHeaders: RawHeaders = [];
    try { outHeaders = JSON.parse(decodeURIComponent(res.headers.get("x-astra-headers") || "%5B%5D")); } catch { /* ignore */ }
    return {
      body: (NULL_BODY.has(status) ? null : res.body ?? new ArrayBuffer(0)) as ReadableStream,
      headers: outHeaders,
      status,
      statusText: decodeURIComponent(res.headers.get("x-astra-status-text") || ""),
    };
  }

  connect(
    url: URL, protocols: string[], _h: RawHeaders,
    onopen: (p: string, e: string) => void, onmessage: (d: unknown) => void,
    onclose: (code: number, reason: string) => void, onerror: (e: string) => void,
  ): [(d: unknown) => void, (code: number, reason: string) => void] {
    let ws: WebSocket | null = null;
    let opened = false;
    const pending: unknown[] = [];
    void supabase.auth.getSession().then(({ data }) => {
      const loc = window.location;
      const q = new URLSearchParams({ url: url.href, protocols: (protocols ?? []).join(","), origin: new URL(url.href.replace(/^ws/, "http")).origin, token: data.session?.access_token ?? "" });
      ws = new WebSocket(`${loc.protocol === "https:" ? "wss" : "ws"}://${loc.host}/api/proxy-ws?${q}`);
      ws.binaryType = "arraybuffer";
      ws.onmessage = (e) => {
        if (!opened && typeof e.data === "string" && e.data.startsWith('{"__astra"')) {
          opened = true;
          let p = ""; try { p = JSON.parse(e.data).protocol ?? ""; } catch { /* ignore */ }
          onopen(p, "");
          for (const d of pending.splice(0)) ws!.send(d as string);
          return;
        }
        onmessage(e.data);
      };
      ws.onclose = (e) => onclose(e.code, e.reason);
      ws.onerror = () => onerror("Live connection failed");
    });
    return [
      (d) => { if (ws && opened) ws.send(d as string); else pending.push(d); },
      (code, reason) => { try { ws?.close(code, reason); } catch { /* ignore */ } },
    ];
  }
}
