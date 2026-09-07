interface QuotedInfo {
  text: string | null;
  sender: string | null;
  hasImage?: boolean;
  hasAudio?: boolean;
}

export function formatQuotedContext(info: QuotedInfo): string | null {
  const { text, sender, hasImage, hasAudio } = info;
  const from = sender?.trim() || "someone";
  const body = text?.trim() || "";

  const attachments: string[] = [];
  if (hasImage) attachments.push("an image");
  if (hasAudio) attachments.push("a voice note/audio");

  if (!body && attachments.length === 0) return null;

  const parts = [`(Replying to ${from}:)`];
  if (body) {
    parts.push("```", body, "```");
  }
  if (attachments.length > 0) {
    parts.push(`The quoted message also contained ${attachments.join(" and ")}.`);
  }
  return parts.join("\n");
}

/**
 * Extract quoted message content from Baileys contextInfo.
 * Returns null when the message is not a reply.
 */
export function extractQuotedContext(
  contextInfo: {
    quotedMessage?: {
      conversation?: string | null;
      extendedTextMessage?: { text?: string | null } | null;
      imageMessage?: { caption?: string | null } | null;
      audioMessage?: Record<string, unknown> | null;
    } | null;
    participant?: string | null;
  } | null | undefined
): QuotedInfo | null {
  if (!contextInfo?.quotedMessage) return null;
  const q = contextInfo.quotedMessage;

  const text =
    q.conversation?.trim() ||
    q.extendedTextMessage?.text?.trim() ||
    q.imageMessage?.caption?.trim() ||
    null;

  const hasImage = Boolean(q.imageMessage);
  const hasAudio = Boolean(q.audioMessage);

  if (!text && !hasImage && !hasAudio) return null;

  const participant = contextInfo.participant;
  const sender = participant
    ? participant.replace(/@.*$/, "")
    : null;

  return { text: text || null, sender, hasImage, hasAudio };
}

export function mergeReplyIntoPrompt(
  userPrompt: string | null,
  replyContext: string | null
): string | null {
  const prompt = userPrompt?.trim() || "";
  if (!replyContext) return prompt || null;
  if (!prompt) {
    return [
      replyContext,
      "",
      "Please read the quoted message above and respond helpfully.",
    ].join("\n");
  }
  return `${replyContext}\n\n${prompt}`;
}
