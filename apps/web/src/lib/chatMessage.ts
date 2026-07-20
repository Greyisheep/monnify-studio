export type ChatBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

export function parseChatBlocks(text: string): ChatBlock[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const parts = trimmed.split(/(?=\d+\.\s+)/);
  if (parts.length >= 3) {
    const intro = parts[0].trim();
    const items = parts
      .slice(1)
      .map((part) => part.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean);
    if (items.length >= 2) {
      const blocks: ChatBlock[] = [];
      if (intro) blocks.push({ kind: "paragraph", text: intro });
      blocks.push({ kind: "list", items });
      return blocks;
    }
  }

  return trimmed
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({ kind: "paragraph" as const, text: part }));
}

export function stripCanvasSuffix(text: string): {
  body: string;
  loaded: boolean;
} {
  const suffix = " Loaded on the canvas, edit freely.";
  if (text.endsWith(suffix)) {
    return { body: text.slice(0, -suffix.length).trim(), loaded: true };
  }
  return { body: text, loaded: false };
}
