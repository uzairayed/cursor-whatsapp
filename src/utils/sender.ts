import type { WAMessage } from "@whiskeysockets/baileys";
import { phoneFromJid } from "./jid.js";

type MessageKey = NonNullable<WAMessage["key"]> & {
  remoteJidAlt?: string | null;
  participantAlt?: string | null;
  senderPn?: string | null;
};

function isDmJid(jid: string | null | undefined): boolean {
  if (!jid) return false;
  return jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid");
}

function isPhoneJid(jid: string | null | undefined): boolean {
  return !!jid && jid.endsWith("@s.whatsapp.net");
}

/** Best JID to reply on (prefer phone JID when available). */
export function resolveSenderJid(msg: WAMessage): string | null {
  const key = msg.key as MessageKey | undefined;
  if (!key) return null;

  const remote = key.remoteJid ?? null;
  const alt = key.remoteJidAlt ?? null;
  const senderPn = key.senderPn ?? null;

  if (isPhoneJid(remote)) return remote;
  if (isPhoneJid(alt)) return alt;
  if (isPhoneJid(senderPn)) return senderPn;
  if (isDmJid(remote)) return remote;
  return null;
}

/** Digits-only phone for allowlist checks, if resolvable. */
export function resolveSenderPhone(msg: WAMessage): string | null {
  const key = msg.key as MessageKey | undefined;
  if (!key) return null;

  for (const candidate of [key.remoteJidAlt, key.senderPn, key.remoteJid]) {
    if (isPhoneJid(candidate)) return phoneFromJid(candidate!);
  }

  // LID-only: no phone digits available from the JID itself
  if (key.remoteJid?.endsWith("@lid")) return null;
  if (key.remoteJid) return phoneFromJid(key.remoteJid) || null;
  return null;
}

export function isDirectChat(msg: WAMessage): boolean {
  const jid = msg.key?.remoteJid;
  return isDmJid(jid);
}
