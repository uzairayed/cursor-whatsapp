/** Extract digits-only phone from a WhatsApp JID like `15551234567@s.whatsapp.net`. */
export function phoneFromJid(jid: string): string {
  return jid.split("@")[0]?.replace(/\D/g, "") ?? "";
}

export function isAllowedPhone(phone: string | null | undefined, allowedNumbers: string[]): boolean {
  if (allowedNumbers.length === 0) return false;
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  return allowedNumbers.some((n) => digits === n || digits.endsWith(n) || n.endsWith(digits));
}

/** @deprecated prefer isAllowedPhone + resolveSenderPhone for LID-safe checks */
export function isAllowedSender(jid: string, allowedNumbers: string[]): boolean {
  return isAllowedPhone(phoneFromJid(jid), allowedNumbers);
}
