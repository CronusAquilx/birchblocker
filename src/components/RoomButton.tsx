import { useState } from "react";
import { Copy, LogOut, Users } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createRoom, joinRoom, leaveRoom, useRoom, type RoomKind } from "@/lib/rooms";
import { cn } from "@/lib/utils";

/** Create / join / show a watch-together (or listen-together) room. */
export function RoomButton({ kind, className }: { kind: RoomKind; className?: string }) {
  const room = useRoom(kind);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const label = kind === "movies" ? "Watch party" : "Listen party";

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setErr("");
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong"); }
    setBusy(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium", room ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent", className)}>
          <Users className="size-3.5" />
          {room ? <span className="font-mono tracking-wider">{room.code} · {room.members.length}</span> : label}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            {kind === "movies" ? "Watch together — everyone in the room can pick titles, episodes and servers." : "Listen together — everyone in the room can pick songs, skip and pause."}
          </DialogDescription>
        </DialogHeader>
        {room ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-4 text-center">
              <p className="text-xs text-muted-foreground">Room code</p>
              <p className="mt-1 font-mono text-3xl tracking-[0.3em]">{room.code}</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => { void navigator.clipboard?.writeText(room.code); toast.success("Code copied"); }}><Copy /> Copy code</Button>
            </div>
            <div>
              <p className="mb-2 text-xs text-muted-foreground">In the room ({room.members.length})</p>
              <ul className="space-y-1 text-sm">
                {room.members.map((m) => <li key={m.id} className="flex items-center gap-2">{m.name}{m.host && <span className="rounded bg-accent px-1.5 text-[10px]">host</span>}</li>)}
              </ul>
            </div>
            <Button variant="destructive" className="w-full" onClick={() => void leaveRoom(kind)}><LogOut /> Leave room</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Button className="w-full" disabled={busy} onClick={() => run(() => createRoom(kind))}>Create a room</Button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or join one<span className="h-px flex-1 bg-border" /></div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) void run(() => joinRoom(kind, code)); }}>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="CODE"
                className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-center font-mono tracking-[0.3em] outline-none focus:ring-2 focus:ring-ring" />
              <Button type="submit" variant="secondary" disabled={busy || code.trim().length < 4}>Join</Button>
            </form>
            {busy && <p className="text-center text-xs text-muted-foreground">Connecting…</p>}
          </div>
        )}
        {err && <p className="text-center text-sm text-destructive">{err}</p>}
      </DialogContent>
    </Dialog>
  );
}
