import type { proto, WAMessage } from "@whiskeysockets/baileys";
import { mergeReplyIntoPrompt } from "./reply-context.js";

export interface MessageContent {
  text: string | null;
  hasImage: boolean;
  hasAudio: boolean;
  isForwarded: boolean;
  inner: proto.IMessage | null;
}

export function unwrapMessage(message: proto.IMessage | null | undefined): proto.IMessage | null {
  if (!message) return null;

  return (
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.viewOnceMessageV2Extension?.message ||
    message.documentWithCaptionMessage?.message ||
    message.editedMessage?.message ||
    message
  );
}

function contextInfo(m: proto.IMessage): proto.IContextInfo | null | undefined {
  return (
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    m.buttonsMessage?.contextInfo ||
    null
  );
}

export function getQuotedContextInfo(msg: WAMessage): proto.IContextInfo | null {
  const inner = unwrapMessage(msg.message);
  if (!inner) return null;
  return contextInfo(inner) ?? null;
}

export function getMessageContent(msg: WAMessage): MessageContent {
  const inner = unwrapMessage(msg.message);
  if (!inner) {
    return {
      text: null,
      hasImage: false,
      hasAudio: false,
      isForwarded: false,
      inner: null,
    };
  }

  const text =
    inner.conversation ||
    inner.extendedTextMessage?.text ||
    inner.imageMessage?.caption ||
    inner.videoMessage?.caption ||
    inner.documentMessage?.caption ||
    null;

  const hasImage = Boolean(inner.imageMessage);
  const hasAudio = Boolean(inner.audioMessage);
  const ctx = contextInfo(inner);
  const isForwarded = Boolean(ctx?.isForwarded || (ctx?.forwardingScore ?? 0) > 0);

  return {
    text: text?.trim() ? text.trim() : null,
    hasImage,
    hasAudio,
    isForwarded,
    inner,
  };
}

/** Prefix a Whisper transcript so Cursor knows it came from a voice note. */
export function buildVoicePrompt(transcript: string, caption?: string | null): string {
  const parts = ["(voice note)", transcript.trim()];
  if (caption?.trim()) parts.push(caption.trim());
  return parts.filter(Boolean).join("\n");
}

export function buildAgentPrompt(input: {
  text: string | null;
  imagePath: string | null;
  isForwarded: boolean;
}): string {
  const parts: string[] = [];

  if (input.isForwarded) {
    parts.push("This message was forwarded from WhatsApp.");
  }

  if (input.imagePath) {
    parts.push(
      "A WhatsApp image is attached. Open and inspect this file:",
      input.imagePath,
      ""
    );
  }

  if (input.text) {
    parts.push(input.text);
  } else if (input.imagePath) {
    parts.push("Please analyze this image and explain anything relevant to the project.");
  }

  return parts.join("\n").trim();
}

export function buildRouterHandleInput(input: {
  text: string | null;
  imagePath: string | null;
  voicePrompt: string | null;
  isForwarded: boolean;
  replyContext: string | null;
  hasImage?: boolean;
}): { text: string; isForwarded: boolean; hasImage: boolean } | null {
  const hasImage = input.hasImage ?? Boolean(input.imagePath);

  if (input.isForwarded) {
    return {
      text: input.voicePrompt ?? input.text ?? "",
      isForwarded: true,
      hasImage,
    };
  }

  if (input.text?.startsWith("/")) {
    return { text: input.text, isForwarded: false, hasImage };
  }

  const basePrompt = input.voicePrompt
    ? input.voicePrompt
    : buildAgentPrompt({
        text: input.text,
        imagePath: input.imagePath,
        isForwarded: false,
      });

  const prompt = mergeReplyIntoPrompt(basePrompt, input.replyContext);
  if (!prompt) return null;

  return { text: prompt, isForwarded: false, hasImage };
}
