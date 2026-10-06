<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Chat models resolve in `src/lib/astra/provider.server.ts`: provider `lovable` uses the hosted Lovable AI Gateway (`hostedFallback()`, Responses API, `LOVABLE_API_KEY`), provider `builtin` is the homemade engine (`src/lib/astra/mini-brain.ts`, no AI call), and any other provider is an OpenAI-compatible endpoint from env vars (`AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL`). The default model is the hosted `lovable` one; `builtin` stays available as a free option.
- Model registry and reasoning levels live in the database (`models`, `reasoning_levels`), so models are added by data, not code.
- Chat streaming goes through the `/api/chat` server route with the user's bearer token; messages persist server-side per thread, and the client sends only the latest message.
- Authenticated pages live under `src/routes/_authenticated/` with `ssr: false`, since the session lives in browser storage.
- Agent tools are defined in `src/lib/astra/tools.server.ts` and gated by rows in the `tools` table (enabled flag), so tools are switched on/off by data.
- The web proxy defaults to the Astra relay transport (`src/lib/astra/relay-transport.ts` → authenticated `/api/proxy` server route) so browsers only contact the app domain; Wisp transports (Epoxy/Libcurl) fall back to the relay when no Wisp server is reachable, because school/work networks block public Wisp hosts.
- Voice mode is a GPT Live call through the Lovable AI Gateway (uses workspace credits): `src/hooks/use-live-voice.ts` ↔ `/api/live` ↔ `src/lib/live-relay.server.ts` (backend model `openai/gpt-6-astra`). The on-device free voice (`src/hooks/use-free-voice.ts`, Whisper + Kokoro) is kept but not wired into the voice page.

- Movies tab: TMDB data and posters go through the `/api/movies` relay route so browsers only contact the app domain; it authenticates via bearer header or `?token=` (iframes/images cannot set headers), streaming-source players load directly (user asked sources not to be proxied).
- Music traffic (iTunes catalog, artwork, lyrics, YouTube lookups) goes through the authenticated `/api/music` relay, playback loads in the scramjet proxy frame, and catalog comes from Deezer via the relay.
