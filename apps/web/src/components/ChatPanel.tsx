/**
 * Chat panel wired to /assistant/chat SSE + /assistant/design (#15).
 * Provenance: #15, D16, Figma Chat tab.
 */
"use client";

import { useRef, useState, type FormEvent } from "react";

import {
  designFromIntent,
  streamAssistantChat,
  type DesignResult,
} from "@/lib/assistantApi";
import type { AnalysisReport, NodeMeta, Workflow } from "@/types";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  design?: DesignResult | null;
}

export interface ChatPanelProps {
  workflow: Workflow | null;
  selectedNodeId: string | null;
  busy?: boolean;
  onApplyDesign: (
    workflow: Workflow,
    nodeTypes: Record<string, NodeMeta>,
    analysis: AnalysisReport,
  ) => void;
}

const STARTER: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    text:
      "Ask about this architecture or findings. Use a design chip to emit a starter IR (validated + analyzed).",
  },
];

type Chip =
  | { label: string; kind: "design"; intent: string; applySafe: boolean }
  | { label: string; kind: "chat"; prompt: string };

const DESIGN_CHIPS: Chip[] = [
  {
    label: "Unsafe marketplace",
    kind: "design",
    intent: "marketplace checkout with split payments (unsafe teaching graph)",
    applySafe: false,
  },
  {
    label: "Safe marketplace",
    kind: "design",
    intent: "marketplace with payout after fulfilment (safe)",
    applySafe: true,
  },
  {
    label: "Why critical findings?",
    kind: "chat",
    prompt: "Why are the critical findings on this workflow?",
  },
];

export function ChatPanel({
  workflow,
  selectedNodeId,
  busy = false,
  onApplyDesign,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(STARTER);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function sendChat(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: trimmed,
    };
    const assistantId = `assistant-${Date.now()}`;
    setMessages((current) => [
      ...current,
      userMessage,
      { id: assistantId, role: "assistant", text: "" },
    ]);
    setDraft("");
    setStreaming(true);

    const history = [...messages, userMessage]
      .filter((message) => message.id !== "welcome")
      .map((message) => ({
        role: message.role,
        content: message.text,
      }));

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamAssistantChat(
        {
          message: trimmed,
          workflow,
          selected_node_id: selectedNodeId,
          history,
        },
        {
          onToken: (token) => {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? { ...message, text: message.text + token }
                  : message,
              ),
            );
          },
          onMessage: (content) => {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId ? { ...message, text: content } : message,
              ),
            );
          },
          onError: (errorMessage) => {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? { ...message, text: `Error: ${errorMessage}` }
                  : message,
              ),
            );
          },
        },
        controller.signal,
      );
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      const fallback =
        error instanceof Error ? error.message : "Chat request failed";
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                text: message.text || `Could not reach assistant: ${fallback}`,
              }
            : message,
        ),
      );
    } finally {
      setStreaming(false);
    }
  }

  async function runDesign(intent: string, applySafe: boolean) {
    if (streaming) return;
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: intent,
    };
    setMessages((current) => [...current, userMessage]);
    setStreaming(true);
    try {
      const result = await designFromIntent(intent, applySafe);
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text:
          result.summary ||
          (result.clarifications.length
            ? result.clarifications.join("\n")
            : "Design ready."),
        design: result.workflow ? result : null,
      };
      setMessages((current) => [...current, assistantMessage]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: error instanceof Error ? error.message : "Design failed",
        },
      ]);
    } finally {
      setStreaming(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void sendChat(draft);
  }

  return (
    <div className="studio-chat" aria-label="Architecture chat">
      <div className="studio-chat__chips" role="group" aria-label="Demo prompts">
        {DESIGN_CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            className="studio-chat__chip"
            disabled={streaming || busy}
            onClick={() => {
              if (chip.kind === "chat") {
                void sendChat(chip.prompt);
                return;
              }
              void runDesign(chip.intent, chip.applySafe);
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <div className="studio-chat__messages">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`studio-chat__bubble studio-chat__bubble--${message.role}`}
          >
            <div className="studio-chat__text">{message.text}</div>
            {message.design?.workflow && message.design.analysis && (
              <button
                type="button"
                className="studio-btn studio-btn--primary studio-chat__apply"
                disabled={busy || streaming}
                onClick={() =>
                  onApplyDesign(
                    message.design!.workflow!,
                    message.design!.node_types,
                    message.design!.analysis!,
                  )
                }
              >
                Apply to canvas
                {message.design.template_id
                  ? ` (${message.design.template_id})`
                  : ""}
              </button>
            )}
          </div>
        ))}
      </div>
      <form className="studio-chat__composer" onSubmit={onSubmit}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about this workflow…"
          aria-label="Chat message"
          disabled={streaming}
        />
        <button
          type="submit"
          className="studio-btn studio-btn--primary"
          disabled={!draft.trim() || streaming || busy}
        >
          {streaming ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
