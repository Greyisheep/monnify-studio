/**
 * Assistant API client: chat SSE + intent→IR design (#15).
 */
import type { AnalysisReport, NodeMeta, Workflow } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8010";

export interface AssistantChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface StreamChatBody {
  message: string;
  workflow?: Workflow | null;
  selected_node_id?: string | null;
  history?: AssistantChatTurn[];
}

export interface DesignResult {
  workflow: Workflow | null;
  node_types: Record<string, NodeMeta>;
  analysis: AnalysisReport | null;
  source: "canned" | "llm";
  template_id: string | null;
  clarifications: string[];
  summary: string;
}

/**
 * POST /assistant/chat — SSE with token / message / error / done events.
 */
export async function streamAssistantChat(
  body: StreamChatBody,
  handlers: {
    onToken?: (text: string) => void;
    onMessage?: (content: string, provider: string) => void;
    onError?: (message: string) => void;
  },
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE}/assistant/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      message: body.message,
      workflow: body.workflow ?? undefined,
      selected_node_id: body.selected_node_id ?? undefined,
      history: body.history ?? [],
    }),
    signal,
    cache: "no-store",
  });
  if (!response.ok || !response.body) {
    throw new Error(`${response.status} /assistant/chat`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const lines = chunk.split("\n");
      let eventName = "message";
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (eventName === "done") return;
      if (dataLines.length === 0) continue;
      const payload = JSON.parse(dataLines.join("\n")) as Record<string, string>;
      if (eventName === "token" && payload.text) {
        handlers.onToken?.(payload.text);
      } else if (eventName === "message" && payload.content) {
        handlers.onMessage?.(payload.content, payload.provider ?? "unknown");
      } else if (eventName === "error" && payload.message) {
        handlers.onError?.(payload.message);
      }
    }
  }
}

export async function designFromIntent(
  intent: string,
  applySafe = false,
): Promise<DesignResult> {
  const response = await fetch(`${API_BASE}/assistant/design`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent, apply_safe: applySafe }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} /assistant/design: ${text}`);
  }
  return response.json() as Promise<DesignResult>;
}
