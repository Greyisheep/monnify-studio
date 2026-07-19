/**
 * Chat panel scaffold for Ask AI (#15). UI-only until SSE/backend wiring.
 * Provenance: #15, Figma Monnify-challenge Chat tab.
 */
"use client";

import { useState, type FormEvent } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

const STARTER: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    text: "Ask about your architecture, findings, or why a node is here. Live AI streaming (#15) wires in next.",
  },
];

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>(STARTER);
  const [draft, setDraft] = useState("");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text,
    };
    const stubReply: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      text: "Received. Server-sent events and the constrained AI assistant will reply here once #15 is connected.",
    };
    setMessages((current) => [...current, userMessage, stubReply]);
    setDraft("");
  }

  return (
    <div className="studio-chat" aria-label="Architecture chat">
      <div className="studio-chat__messages">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`studio-chat__bubble studio-chat__bubble--${message.role}`}
          >
            {message.text}
          </div>
        ))}
      </div>
      <form className="studio-chat__composer" onSubmit={onSubmit}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about this workflow…"
          aria-label="Chat message"
        />
        <button type="submit" className="studio-btn studio-btn--primary" disabled={!draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
