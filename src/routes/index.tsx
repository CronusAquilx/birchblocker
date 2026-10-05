import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { AstraMark } from "@/components/astra/Mark";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Astra — your own AI agent" },
      { name: "description", content: "Chat with Astra, a private AI agent running on your own model server." },
      { property: "og:title", content: "Astra — your own AI agent" },
      { property: "og:description", content: "Chat with Astra, a private AI agent running on your own model server." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { session, loading } = useAuth();
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center sky">
        <AstraMark className="size-8" pulsing />
      </div>
    );
  return <Navigate to={session ? "/chat" : "/auth"} replace />;
}
