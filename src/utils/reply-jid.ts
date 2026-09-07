/**
 * Prefer the live chat JID (often @lid). Sending to the phone PN while the
 * session lives on a LID produces "Waiting for this message" on phones.
 */
export function resolveReplyJid(input: {
  senderJid: string;
  phone: string | null;
}): string {
  if (input.senderJid.endsWith("@lid") || input.senderJid.endsWith("@s.whatsapp.net")) {
    return input.senderJid;
  }
  if (input.phone) return `${input.phone}@s.whatsapp.net`;
  return input.senderJid;
}
