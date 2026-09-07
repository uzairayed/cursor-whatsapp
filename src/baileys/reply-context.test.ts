import { describe, expect, it } from "vitest";
import {
  extractQuotedContext,
  formatQuotedContext,
  mergeReplyIntoPrompt,
} from "./reply-context.js";

describe("formatQuotedContext", () => {
  it("formats plain text quote", () => {
    const out = formatQuotedContext({
      text: "Deploy failed on staging",
      sender: "ali",
    });
    expect(out).toMatch(/ali/);
    expect(out).toContain("Deploy failed on staging");
  });

  it("formats image quote without text", () => {
    const out = formatQuotedContext({
      text: null,
      sender: null,
      hasImage: true,
    });
    expect(out).toMatch(/image/i);
  });

  it("formats audio/voice note quote", () => {
    const out = formatQuotedContext({
      text: null,
      sender: "bob",
      hasAudio: true,
    });
    expect(out).toMatch(/voice note|audio/i);
  });

  it("returns null for empty quote", () => {
    expect(formatQuotedContext({ text: null, sender: null })).toBeNull();
  });
});

describe("extractQuotedContext", () => {
  it("extracts text from contextInfo.quotedMessage.conversation", () => {
    const result = extractQuotedContext({
      quotedMessage: {
        conversation: "Deploy failed on staging",
      },
      participant: "923001234567@s.whatsapp.net",
    });
    expect(result).not.toBeNull();
    expect(result!.text).toBe("Deploy failed on staging");
  });

  it("extracts text from extendedTextMessage", () => {
    const result = extractQuotedContext({
      quotedMessage: {
        extendedTextMessage: { text: "See the attached log" },
      },
      participant: "923001234567@s.whatsapp.net",
    });
    expect(result!.text).toBe("See the attached log");
  });

  it("detects quoted images", () => {
    const result = extractQuotedContext({
      quotedMessage: {
        imageMessage: { caption: "Screenshot of error" },
      },
    });
    expect(result!.hasImage).toBe(true);
    expect(result!.text).toBe("Screenshot of error");
  });

  it("detects quoted audio", () => {
    const result = extractQuotedContext({
      quotedMessage: {
        audioMessage: {},
      },
    });
    expect(result!.hasAudio).toBe(true);
  });

  it("returns null when no quoted message", () => {
    expect(extractQuotedContext({})).toBeNull();
    expect(extractQuotedContext(null)).toBeNull();
    expect(extractQuotedContext(undefined)).toBeNull();
  });
});

describe("mergeReplyIntoPrompt", () => {
  it("prepends reply context to the user prompt", () => {
    const merged = mergeReplyIntoPrompt(
      "summarize this",
      "(Replying to someone:)\n```\nDeploy failed\n```"
    );
    expect(merged).toMatch(/Deploy failed/);
    expect(merged).toMatch(/summarize this/);
  });

  it("asks to read the quote when the user only replied with no extra text", () => {
    const merged = mergeReplyIntoPrompt(
      null,
      "(Replying to someone:)\n```\nDeploy failed\n```"
    );
    expect(merged).toMatch(/Deploy failed/);
    expect(merged).toMatch(/read the quoted message/i);
  });

  it("returns just the prompt when no reply context", () => {
    expect(mergeReplyIntoPrompt("hello", null)).toBe("hello");
  });

  it("returns null when both are empty", () => {
    expect(mergeReplyIntoPrompt(null, null)).toBeNull();
  });
});
