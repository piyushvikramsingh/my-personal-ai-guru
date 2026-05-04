import { createFileRoute } from "@tanstack/react-router";
import { ChatApp } from "@/components/chat/ChatApp";
import { AuthGate } from "@/components/chat/AuthGate";

export const Route = createFileRoute("/chat")({
  component: () => (
    <AuthGate>
      <ChatApp />
    </AuthGate>
  ),
});
