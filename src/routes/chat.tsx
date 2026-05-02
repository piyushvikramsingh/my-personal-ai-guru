import { createFileRoute } from "@tanstack/react-router";
import { ChatApp } from "@/components/chat/ChatApp";

export const Route = createFileRoute("/chat")({ component: ChatApp });
