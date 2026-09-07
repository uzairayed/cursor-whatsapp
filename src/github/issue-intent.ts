export function parseIssueIntent(text: string): { body: string } | null {
  const match = /^\/?issue(?:\s+([\s\S]*))?$/i.exec(text);
  if (!match) return null;
  return { body: (match[1] ?? "").trim() };
}
