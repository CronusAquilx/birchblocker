import { useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Watch/listen-together rooms. A room is a live channel named by a short code;
 * everyone in it shares one state object and anyone can change it (last write wins).
 */
export type RoomKind = "movies" | "music";
export type MovieState = { type: string; id: number; s?: number; e?: number; server?: string };
export type MusicTrack = { id: string; title: string; artist: string; artistId: string; album: string; albumId: string; art: string; duration: number; preview?: string };
export type MusicState = { queue: MusicTrack[]; cur: number; server: string; paused: boolean; t: number };
export type RoomState = { movie?: MovieState; music?: MusicState; v: number; by: string };
export type Member = { id: string; name: string; host: boolean };
export type Room = { kind: RoomKind; code: string; host: boolean; members: Member[]; state: RoomState | null; status: "joining" | "live" };

const me = { id: "", name: "" };
const rooms: Partial<Record<RoomKind, Room>> = {};
const channels: Partial<Record<RoomKind, RealtimeChannel>> = {};
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function update(kind: RoomKind, patch: Partial<Room> | null) {
  if (patch === null) delete rooms[kind];
  else rooms[kind] = { ...(rooms[kind] as Room), ...patch };
  emit();
}

async function identity() {
  if (!me.id) {
    const { data } = await supabase.auth.getSession();
    const u = data.session?.user;
    me.id = `${u?.id ?? "guest"}-${Math.random().toString(36).slice(2, 8)}`;
    me.name = (u?.user_metadata?.["full_name"] as string) || u?.email?.split("@")[0] || "Guest";
  }
  return me;
}

const makeCode = () => Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");

async function connect(kind: RoomKind, code: string, host: boolean): Promise<void> {
  await leaveRoom(kind);
  const who = await identity();
  update(kind, { kind, code, host, members: [], state: null, status: "joining" });
  const ch = supabase.channel(`bb-room-${kind}-${code}`, { config: { presence: { key: who.id }, broadcast: { self: false } } });
  channels[kind] = ch;

  ch.on("presence", { event: "sync" }, () => {
    const st = ch.presenceState<{ name: string; host: boolean }>();
    const members = Object.entries(st).map(([id, metas]) => ({ id, name: metas[0]?.name ?? "Guest", host: Boolean(metas[0]?.host) }));
    update(kind, { members });
  });
  ch.on("broadcast", { event: "state" }, ({ payload }) => {
    const s = payload as RoomState;
    const cur = rooms[kind]?.state;
    if (!cur || s.v > cur.v) update(kind, { state: s });
  });
  ch.on("broadcast", { event: "hello" }, () => {
    const s = rooms[kind]?.state;
    if (s) void ch.send({ type: "broadcast", event: "state", payload: s });
  });

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Couldn't connect to the room")), 10000);
    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(t);
        await ch.track({ name: who.name, host });
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(t);
        reject(new Error("Couldn't connect to the room"));
      }
    });
  }).catch(async (e) => { await leaveRoom(kind); throw e; });

  if (!host) {
    // Make sure someone is actually in this room.
    await new Promise((r) => setTimeout(r, 1500));
    if ((rooms[kind]?.members.length ?? 0) < 2) { await leaveRoom(kind); throw new Error("No room with that code"); }
    void ch.send({ type: "broadcast", event: "hello", payload: {} });
  }
  update(kind, { status: "live" });
}

export async function createRoom(kind: RoomKind) {
  const code = makeCode();
  await connect(kind, code, true);
  return code;
}

export async function joinRoom(kind: RoomKind, code: string) {
  await connect(kind, code.trim().toUpperCase(), false);
}

export async function leaveRoom(kind: RoomKind) {
  const ch = channels[kind];
  delete channels[kind];
  if (ch) await supabase.removeChannel(ch).catch(() => {});
  if (rooms[kind]) update(kind, null);
}

/** Changes the shared state for everyone in the room. */
export function setRoomState(kind: RoomKind, patch: Partial<Omit<RoomState, "v" | "by">>) {
  const ch = channels[kind];
  const room = rooms[kind];
  if (!ch || !room) return;
  const state: RoomState = { ...(room.state ?? {}), ...patch, v: Date.now(), by: me.id };
  update(kind, { state });
  void ch.send({ type: "broadcast", event: "state", payload: state });
}

export const myRoomId = () => me.id;
export const getRoom = (kind: RoomKind) => rooms[kind] ?? null;

export function useRoom(kind: RoomKind): Room | null {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f); },
    () => rooms[kind] ?? null,
    () => null,
  );
}
