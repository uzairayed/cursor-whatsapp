import { downloadMediaMessage, type WAMessage, type WASocket } from "@whiskeysockets/baileys";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pino from "pino";
import { unwrapMessage } from "./message-content.js";

const mediaLogger = pino({ level: "silent" });

function extensionFor(mimetype: string | null | undefined): string {
  if (!mimetype) return "ogg";
  if (mimetype.includes("mpeg") || mimetype.includes("mp3")) return "mp3";
  if (mimetype.includes("mp4") || mimetype.includes("m4a")) return "m4a";
  if (mimetype.includes("wav")) return "wav";
  if (mimetype.includes("webm")) return "webm";
  return "ogg";
}

/** Download an audio / voice-note message into inboxDir. Returns absolute path. */
export async function saveWhatsAppAudio(
  sock: WASocket,
  msg: WAMessage,
  inboxDir: string
): Promise<string> {
  mkdirSync(inboxDir, { recursive: true });

  const inner = unwrapMessage(msg.message);
  const mimetype = inner?.audioMessage?.mimetype;
  const ext = extensionFor(mimetype);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const dest = join(inboxDir, filename);

  const downloadMsg: WAMessage = inner?.audioMessage
    ? ({ ...msg, message: { audioMessage: inner.audioMessage } } as WAMessage)
    : msg;

  const buffer = await downloadMediaMessage(
    downloadMsg,
    "buffer",
    {},
    {
      logger: mediaLogger,
      reuploadRequest: sock.updateMediaMessage,
    }
  );

  writeFileSync(dest, buffer as Buffer);
  return dest;
}
