"use client";

import { useState, type FormEvent } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export interface ChatPanelProps {
  busy: boolean;
  onAsk: (message: string) => Promise<{
    kind: "compose" | "template" | "clarify";
    explanation: string;
    workflowName: string | null;
    templateId?: string;
  }>;
  onClose: () => void;
}

const STARTER: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    text:
      "Describe what you want to set up. I’ll compose a flow (or pick a vetted template) and put it on the canvas.",
  },
];

const PROMPTS = [
  "I want an ajo / thrift contribution app",
  "Sell online with verified payments",
  "Build me a payroll for my team",
];

export function ChatPanel({ busy, onAsk, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(STARTER);
  const [draft, setDraft] = useState("");

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: trimmed,
    };
    setMessages((current) => [...current, userMessage]);
    setDraft("");

    try {
      const result = await onAsk(trimmed);
      const suffix =
        result.kind === "compose"
          ? " Loaded on the canvas — edit freely."
          : result.kind === "template"
            ? ` Template “${result.templateId}” is on the canvas.`
            : "";
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: `${result.explanation}${suffix}`,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text:
            error instanceof Error
              ? error.message
              : "Could not reach Moni. Is the API running?",
        },
      ]);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(draft);
  }

  return (
    <aside className="studio-overlay studio-overlay--chat" aria-label="Moni chat">
      <div className="studio-overlay__head">
        <div>
          <h2>Moni</h2>
          <p>Compose a flow · lands on the canvas</p>
        </div>
        <button type="button" className="ghost-btn" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="studio-chat">
        <div className="studio-chat__chips" role="group" aria-label="Try these">
          {PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="studio-chat__chip"
              disabled={busy}
              onClick={() => void submit(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
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
            placeholder="e.g. collect caution fees from tenants…"
            aria-label="Message for Moni"
            disabled={busy}
          />
          <button
            type="submit"
            className="primary-btn"
            disabled={!draft.trim() || busy}
          >
            {busy ? "…" : "Send"}
          </button>
        </form>
      </div>
    </aside>
  );
}
