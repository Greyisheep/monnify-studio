/**
 * Moni Chat tab — Figma Whiteboard/Chat/New (118:3740 / 118:3733).
 * Provenance: #15, #55, #110, D16, D18.
 */
"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

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
  flowChoice?: { message: string };
}

export interface ChatPanelProps {
  busy: boolean;
  hasOpenWorkflow: boolean;
  onAsk: (
    message: string,
    onStatus?: (text: string) => void,
  ) => Promise<MoniAskResult>;
  onRefine: (
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
      "Hi, I’m Moni. Describe what you want to set up. I’ll compose a flow when an AI key is available, or propose a vetted template you can confirm with Set this up.",
  },
];

const PROMPTS = [
  "I want an Ajo/contribution app",
  "Sell online with verified payments",
  "Make payroll for my team",
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
      {showLoaded ? (
        <p className="studio-chat__badge">Loaded on the canvas, edit freely.</p>
      ) : null}
    </div>
  );
}

export function ChatPanel({
  busy,
  hasOpenWorkflow,
  onAsk,
  onRefine,
  onSetupIntent,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(STARTER);
  const [draft, setDraft] = useState("");
  const tailRef = useRef<HTMLDivElement>(null);
  const showSuggestions =
    messages.length <= 1 && !messages.some((m) => m.role === "user");

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

  async function runRequest(
    text: string,
    assistantId: string,
    mode: "compose" | "refine",
  ) {
    patchAssistant(assistantId, {
      text: "",
      streaming: true,
      statusText: mode === "refine" ? "Checking a revision…" : "Working…",
      flowChoice: undefined,
    });
    try {
      const result = await (mode === "refine" ? onRefine : onAsk)(text, (status) => {
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

      const safetyStory =
        result.kind === "refine"
          ? result.findingsCaught.length
            ? `\n\nMoni proposed → checker caught ${result.findingsCaught.join(", ")} → fixed${
                result.steps.length
                  ? ` (${result.steps.map((step) => step.action).join("; ")})`
                  : ""
              } → clean.`
            : `\n\nMoni proposed → checker checked${
                result.steps.length
                  ? ` (${result.steps.map((step) => step.action).join("; ")})`
                  : ""
              } → clean.`
          : "";
      const suffix =
        result.kind === "compose" || result.kind === "refine"
          ? " Loaded on the canvas, edit freely."
          : "";
      patchAssistant(assistantId, {
        streaming: false,
        statusText: undefined,
        text: `${result.explanation}${safetyStory}${suffix}`,
        loadedOnCanvas: result.kind === "compose" || result.kind === "refine",
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
        text: hasOpenWorkflow
          ? "Would you like to change this Flow, or start a new one?"
          : "",
        streaming: !hasOpenWorkflow,
        statusText: hasOpenWorkflow ? undefined : "Working…",
        flowChoice: hasOpenWorkflow ? { message: trimmed } : undefined,
      },
    ]);
    setDraft("");
    if (!hasOpenWorkflow) void runRequest(trimmed, assistantId, "compose");
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
          text: `Set up “${message.intent!.templateId}” on the canvas. Check Preview for the flow summary.`,
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
      <div className="studio-chat__messages">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`studio-chat__row studio-chat__row--${message.role}${
              message.id === "welcome" ? " is-welcome" : ""
            }`}
          >
            {message.role === "assistant" && message.id !== "welcome" ? (
              <span className="studio-chat__avatar" aria-hidden>
                M
              </span>
            ) : null}
            <div
              className={`studio-chat__bubble studio-chat__bubble--${message.role}${
                message.streaming ? " is-streaming" : ""
              }${message.id === "welcome" ? " is-welcome" : ""}`}
            >
              {message.streaming ? (
                <div className="studio-chat__thinking">
                  <span className="studio-chat__thinking-label">
                    {message.statusText ?? "Working…"}
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
                  {message.intent ? (
                    <button
                      type="button"
                      className="studio-btn studio-btn--primary studio-chat__setup"
                      disabled={busy}
                      onClick={() => void setup(message)}
                    >
                      Set this up
                    </button>
                  ) : null}
                  {message.flowChoice ? (
                    <div className="studio-chat__choices" role="group" aria-label="Choose Flow action">
                      <button
                        type="button"
                        className="studio-btn studio-btn--primary studio-chat__setup"
                        disabled={busy}
                        onClick={() =>
                          void runRequest(message.flowChoice!.message, message.id, "refine")
                        }
                      >
                        Fix / change this Flow
                      </button>
                      <button
                        type="button"
                        className="studio-btn studio-chat__setup"
                        disabled={busy}
                        onClick={() =>
                          void runRequest(message.flowChoice!.message, message.id, "compose")
                        }
                      >
                        Start a new Flow
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={tailRef} className="studio-chat__tail" />
      </div>

      {showSuggestions ? (
        <div className="studio-chat__suggestions">
          <p className="studio-chat__suggestions-label">Suggestions</p>
          <div className="studio-chat__chips" role="group" aria-label="Suggestions">
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
        </div>
      ) : null}

      <form className="studio-chat__composer" onSubmit={onSubmit}>
        <div className="studio-chat__input">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onComposerKeyDown}
            placeholder="Describe what you want to set up."
            aria-label="Describe what you want to set up"
            disabled={busy}
            rows={3}
          />
          <div className="studio-chat__input-bar">
            <span className="studio-chat__attach" aria-hidden>
              <Image
                src="/figma/icon-plus.svg"
                alt=""
                width={14}
                height={14}
                unoptimized
              />
            </span>
            <button
              type="submit"
              className="studio-chat__send"
              disabled={!draft.trim() || busy}
              aria-label={busy ? "Sending" : "Send"}
            >
              {busy ? "…" : "↑"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
