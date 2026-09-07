const TITLE_MAX = 80;
const ELLIPSIS = "…";

export function buildIssueDraft(input: {
  text: string | null;
  hasImage?: boolean;
  imageUrl?: string;
}): { title: string; body: string } {
  return {
    title: buildTitle(input),
    body: buildBody(input),
  };
}

function buildTitle(input: { text: string | null; hasImage?: boolean }): string {
  const firstLine = firstNonEmptyLine(input.text);
  if (!firstLine) {
    return input.hasImage ? "WhatsApp screenshot" : "WhatsApp note";
  }
  if (firstLine.length <= TITLE_MAX) return firstLine;
  return firstLine.slice(0, TITLE_MAX - ELLIPSIS.length) + ELLIPSIS;
}

function firstNonEmptyLine(text: string | null): string | null {
  if (!text) return null;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function buildBody(input: {
  text: string | null;
  hasImage?: boolean;
  imageUrl?: string;
}): string {
  const parts: string[] = [];
  if (input.text) parts.push(input.text);
  if (input.imageUrl) {
    parts.push(`![WhatsApp screenshot](${input.imageUrl})`);
  } else if (input.hasImage) {
    parts.push("A screenshot was attached.");
  }
  parts.push("Filed from WhatsApp.");
  return parts.join("\n\n");
}
