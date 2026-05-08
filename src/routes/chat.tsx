import { createFileRoute } from "@tanstack/react-router";
import { ChatApp } from "@/components/chat/ChatApp";
import { AuthGate } from "@/components/chat/AuthGate";

function ChatPage() {
  return (
    <AuthGate>
      <ChatApp />
    </AuthGate>
  );
}

export const Route = createFileRoute("/chat")({
  component: ChatPage,
});
