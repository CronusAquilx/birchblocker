import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { myRoomId, useRoom } from "@/lib/rooms";

/** Brings room members to whatever someone else in the room just picked. */
export function RoomFollower() {
  const movies = useRoom("movies");
  const music = useRoom("music");
  const navigate = useNavigate();
  const path = useLocation({ select: (l) => l.pathname });
  const lastMovie = useRef(0);
  const lastMusic = useRef(0);

  useEffect(() => {
    const s = movies?.state;
    if (!s?.movie || s.v === lastMovie.current) return;
    lastMovie.current = s.v;
    if (s.by === myRoomId()) return;
    const m = s.movie;
    if (path === `/movies/watch/${m.type}/${m.id}`) return; // the player page syncs episodes itself
    void navigate({ to: "/movies/watch/$type/$id", params: { type: m.type, id: String(m.id) }, search: { ...(m.s ? { s: m.s } : {}), ...(m.e ? { e: m.e } : {}) } });
  }, [movies?.state?.v]);

  useEffect(() => {
    const s = music?.state;
    if (!s?.music || s.v === lastMusic.current) return;
    lastMusic.current = s.v;
    if (s.by !== myRoomId() && path !== "/music") void navigate({ to: "/music" });
  }, [music?.state?.v]);

  return null;
}
