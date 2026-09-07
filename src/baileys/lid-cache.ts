/** In-memory LID → phone cache so later decrypt-failed frames still authorize. */
const lidToPhone = new Map<string, string>();

export function rememberLidPhone(lidJid: string | null | undefined, phone: string | null): void {
  if (!lidJid?.endsWith("@lid") || !phone) return;
  lidToPhone.set(lidJid, phone);
}

export function phoneFromLidCache(lidJid: string | null | undefined): string | null {
  if (!lidJid?.endsWith("@lid")) return null;
  return lidToPhone.get(lidJid) ?? null;
}
