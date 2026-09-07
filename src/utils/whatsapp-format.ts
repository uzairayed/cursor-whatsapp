/**
 * Convert common Markdown from Cursor into WhatsApp-friendly markup.
 * WhatsApp supports: *bold* _italic_ ~strike~ ```code```
 *
 * Important: bare https:// URLs must NOT sit inside *bold* or WhatsApp
 * won't make them tappable.
 */
const URL_RE = /https?:\/\/[^\s<>"'`)\]]+/g;

export function formatForWhatsApp(input: string): string {
  const fences: string[] = [];
  const inlines: string[] = [];
  const urls: string[] = [];
  let text = input.replace(/\r\n/g, "\n");

  // Protect fenced code blocks
  text = text.replace(/```([\s\S]*?)```/g, (_m, body: string) => {
    const idx = fences.length;
    const cleaned = String(body).replace(/^\w*\n/, "");
    fences.push("```\n" + cleaned.replace(/^\n+|\n+$/g, "") + "\n```");
    return `\u0000FENCE${idx}\u0000`;
  });

  // Protect inline code
  text = text.replace(/`([^`\n]+)`/g, (_m, body: string) => {
    const idx = inlines.length;
    inlines.push("```" + body + "```");
    return `\u0000INLINE${idx}\u0000`;
  });

  // Markdown links → label + URL on its own line (most reliable for WhatsApp)
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_m, label: string, url: string) => {
    return `${label}\n${url}\n`;
  });

  // Unwrap URLs Cursor wrapped in bold/italic before any other markup transforms
  text = text.replace(/\*\*(https?:\/\/[^\s*]+)\*\*/g, "$1");
  text = text.replace(/__(https?:\/\/[^\s_]+)__/g, "$1");
  text = text.replace(/(^|[\s(])\*(https?:\/\/[^\s*]+)\*(?=[\s).,]|$)/gm, "$1$2");

  // Protect bare URLs before bold/italic transforms
  text = text.replace(URL_RE, (url) => {
    const cleaned = url.replace(/[.,;:!?]+$/g, "");
    const idx = urls.length;
    urls.push(cleaned);
    return `\u0000URL${idx}\u0000`;
  });

  // Headings → bold line
  text = text.replace(/^#{1,6}\s+(.+)$/gm, (_m, title: string) => `*${title.trim()}*\n`);

  // Bold **text** or __text__ → *text*
  text = text.replace(/\*\*(.+?)\*\*/g, "*$1*");
  text = text.replace(/__(.+?)__/g, "*$1*");

  // Horizontal rules
  text = text.replace(/^(-{3,}|\*{3,}|_{3,})$/gm, "");

  // Bullets
  text = text.replace(/^[\t ]*[-*+]\s+/gm, "• ");

  // Numbered lists
  text = text.replace(/^[\t ]*(\d+)\.\s+/gm, "$1. ");

  // Blockquotes
  text = text.replace(/^>\s?/gm, "");

  // Restore URLs on their own line when glued to other text
  text = text.replace(/\u0000URL(\d+)\u0000/g, (_m, i) => {
    const url = urls[Number(i)] ?? "";
    return `\n${url}\n`;
  });

  // Strip accidental bold/italic wrappers left around URL placeholders (defensive)
  text = text.replace(/\*\n(https?:\/\/[^\s*]+)\n\*/g, "\n$1\n");
  text = text.replace(/_(https?:\/\/[^\s_]+)_/g, "$1");

  // Restore inline code + fences
  text = text.replace(/\u0000INLINE(\d+)\u0000/g, (_m, i) => inlines[Number(i)] ?? "");
  text = text.replace(/\u0000FENCE(\d+)\u0000/g, (_m, i) => fences[Number(i)] ?? "");

  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}
