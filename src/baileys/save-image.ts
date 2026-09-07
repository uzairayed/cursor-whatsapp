import { downloadMediaMessage, type WAMessage, type WASocket } from "@whiskeysockets/baileys";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pino from "pino";
import { unwrapMessage } from "./message-content.js";

const mediaLogger = pino({ level: "silent" });

function extensionFor(mimetype: string | null | undefined): string {
  if (!mimetype) return "jpg";
  if (mimetype.includes("png")) return "png";
  if (mimetype.includes("webp")) return "webp";
  if (mimetype.includes("gif")) return "gif";
  return "jpg";
}

/** Download an image message into inboxDir. Returns absolute path. */
export async function saveWhatsAppImage(
  sock: WASocket,
  msg: WAMessage,
  inboxDir: string
): Promise<string> {
  mkdirSync(inboxDir, { recursive: true });

  const inner = unwrapMessage(msg.message);
  const mimetype = inner?.imageMessage?.mimetype;
  const ext = extensionFor(mimetype);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const dest = join(inboxDir, filename);

  // downloadMediaMessage expects the WAMessage; for wrappers, synthesize a flat message
  const downloadMsg: WAMessage = inner?.imageMessage
    ? ({ ...msg, message: { imageMessage: inner.imageMessage } } as WAMessage)
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
