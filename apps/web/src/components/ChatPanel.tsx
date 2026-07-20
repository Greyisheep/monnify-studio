"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { parseChatBlocks, stripCanvasSuffix } from "@/lib/chatMessage";
import type { IntentResult, MoniAskResult } from "@/types";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
  statusText?: string;
  loadedOnCanvas?: boolean;
  intent?: {
    templateId: string;
    config: IntentResult["config"];
    confidence: number;
  };
}

export interface ChatPanelProps {
  busy: boolean;
  onAsk: (
    message: string,
    onStatus?: (text: string) => void,
  ) => Promise<MoniAskResult>;
  onSetupIntent: (
    templateId: string,
    config: IntentResult["config"],
  ) => Promise<void>;
}

const STARTER: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    text:
      "Describe what you want to set up. I'll compose a flow when an AI key is available, or propose a vetted template you can confirm with Set this up.",
  },
];

const PROMPTS = [
  "I want an ajo / thrift contribution app",
  "Sell online with verified payments",
  "Build me a payroll for my team",
];

function ChatMessageBody({
  text,
  loadedOnCanvas,
}: {
  text: string;
  loadedOnCanvas?: boolean;
}) {
  const { body, loaded } = stripCanvasSuffix(text);
  const blocks = parseChatBlocks(body);
  const showLoaded = loadedOnCanvas || loaded;

  return (
    <div className="studio-chat__body">
      {blocks.map((block, index) =>
        block.kind === "list" ? (
          <ol key={index} className="studio-chat__list">
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        ) : (
          <p key={index}>{block.text}</p>
        ),
      )}
      {showLoaded && (
        <p className="studio-chat__badge">Loaded on the canvas, edit freely.</p>
      )}
    </div>
  );
}

export function ChatPanel({ busy, onAsk, onSetupIntent }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(STARTER);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tailRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  function patchAssistant(id: string, patch: Partial<ChatMessage>) {
    setMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, ...patch } : message,
      ),
    );
  }

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: trimmed,
    };
    const assistantId = `assistant-${Date.now()}`;
    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: assistantId,
        role: "assistant",
        text: "",
        streaming: true,
        statusText: "Reading what you need...",
      },
    ]);
    setDraft("");

    try {
      const result = await onAsk(trimmed, (status) => {
        patchAssistant(assistantId, { statusText: status });
      });

      if (result.kind === "intent") {
        patchAssistant(assistantId, {
          streaming: false,
          statusText: undefined,
          text: result.explanation,
          intent: {
            templateId: result.templateId,
            config: result.config,
            confidence: result.confidence,
          },
        });
        return;
      }

      const suffix =
        result.kind === "compose" ? " Loaded on the canvas, edit freely." : "";
      patchAssistant(assistantId, {
        streaming: false,
        statusText: undefined,
        text: `${result.explanation}${suffix}`,
        loadedOnCanvas: result.kind === "compose",
      });
    } catch (error) {
      patchAssistant(assistantId, {
        streaming: false,
        statusText: undefined,
        text:
          error instanceof Error
            ? error.message
            : "Could not reach Moni. Is the API running?",
      });
    }
  }

  async function setup(message: ChatMessage) {
    if (!message.intent || busy) return;
    try {
      await onSetupIntent(message.intent.templateId, message.intent.config);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: `Set up "${message.intent!.templateId}" on the canvas and opened Seller preview.`,
          loadedOnCanvas: true,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: error instanceof Error ? error.message : "Set up failed",
        },
      ]);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(draft);
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit(draft);
    }
  }

  return (
    <div className="studio-chat" aria-label="Moni chat">
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
      <div className="studio-chat__messages" ref={scrollRef}>
        {messages.map((message) => (
          <div
            key={message.id}
            className={`studio-chat__row studio-chat__row--${message.role}`}
          >
            {message.role === "assistant" && (
              <span className="studio-chat__avatar" aria-hidden>
                M
              </span>
            )}
            <div
              className={`studio-chat__bubble studio-chat__bubble--${message.role}${
                message.streaming ? " is-streaming" : ""
              }`}
            >
              {message.streaming ? (
                <div className="studio-chat__thinking">
                  <span className="studio-chat__thinking-label">
                    {message.statusText ?? "Working..."}
                  </span>
                  <span className="studio-chat__dots" aria-hidden>
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              ) : (
                <>
                  <ChatMessageBody
                    text={message.text}
                    loadedOnCanvas={message.loadedOnCanvas}
                  />
                  {message.intent && (
                    <button
                      type="button"
                      className="studio-btn studio-btn--primary studio-chat__setup"
                      disabled={busy}
                      onClick={() => void setup(message)}
                    >
                      Set this up
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={tailRef} className="studio-chat__tail" />
      </div>
      <form className="studio-chat__composer" onSubmit={onSubmit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder="e.g. collect caution fees from tenants..."
          aria-label="Message for Moni"
          disabled={busy}
          rows={2}
        />
        <button
          type="submit"
          className="studio-btn studio-btn--primary"
          disabled={!draft.trim() || busy}
        >
          {busy ? "Working..." : "Send"}
        </button>
      </form>
    </div>
  );
}
