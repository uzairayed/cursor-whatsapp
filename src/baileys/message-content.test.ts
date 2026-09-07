import { describe, expect, it } from "vitest";
import {
  buildAgentPrompt,
  buildRouterHandleInput,
  buildVoicePrompt,
  getMessageContent,
} from "./message-content.js";

describe("getMessageContent", () => {
  it("reads plain and forwarded text", () => {
    expect(
      getMessageContent({
        message: { conversation: "hello" },
      } as never)
    ).toMatchObject({ text: "hello", hasImage: false, isForwarded: false });

    expect(
      getMessageContent({
        message: {
          extendedTextMessage: {
            text: "fwd",
            contextInfo: { isForwarded: true, forwardingScore: 2 },
          },
        },
      } as never)
    ).toMatchObject({ text: "fwd", hasImage: false, isForwarded: true });
  });

  it("detects images with or without caption", () => {
    expect(
      getMessageContent({
        message: { imageMessage: { caption: "bug here", mimetype: "image/jpeg" } },
      } as never)
    ).toMatchObject({ text: "bug here", hasImage: true });

    expect(
      getMessageContent({
        message: { imageMessage: { mimetype: "image/png" } },
      } as never)
    ).toMatchObject({ text: null, hasImage: true });
  });

  it("unwraps ephemeral / view-once wrappers", () => {
    expect(
      getMessageContent({
        message: {
          ephemeralMessage: {
            message: { conversation: "secret" },
          },
        },
      } as never)
    ).toMatchObject({ text: "secret" });
  });

  it("detects voice notes / audio messages", () => {
    expect(
      getMessageContent({
        message: { audioMessage: { mimetype: "audio/ogg; codecs=opus", ptt: true } },
      } as never)
    ).toMatchObject({ hasAudio: true, hasImage: false, text: null });
  });
});

describe("buildVoicePrompt", () => {
  it("prefixes the transcript", () => {
    expect(buildVoicePrompt("fix the login bug")).toBe(
      "(voice note)\nfix the login bug"
    );
  });
});

describe("buildAgentPrompt", () => {
  it("includes image path and forwarded note", () => {
    const prompt = buildAgentPrompt({
      text: "what's wrong?",
      imagePath: "/tmp/shot.jpg",
      isForwarded: true,
    });
    expect(prompt).toContain("/tmp/shot.jpg");
    expect(prompt).toContain("what's wrong?");
    expect(prompt).toMatch(/forwarded/i);
  });

  it("uses a default ask when image has no caption", () => {
    const prompt = buildAgentPrompt({
      text: null,
      imagePath: "/tmp/shot.jpg",
      isForwarded: false,
    });
    expect(prompt).toContain("/tmp/shot.jpg");
    expect(prompt.toLowerCase()).toContain("image");
  });
});

describe("buildRouterHandleInput", () => {
  it("uses forwarded caption text as issue source without a forwarded note", () => {
    const result = buildRouterHandleInput({
      text: "checkout 500s",
      imagePath: null,
      voicePrompt: null,
      isForwarded: true,
      replyContext: null,
    });
    expect(result).toEqual({
      text: "checkout 500s",
      isForwarded: true,
      hasImage: false,
    });
    expect(result?.text).not.toMatch(/forwarded from WhatsApp/i);
  });

  it("keeps a forwarded image caption and omits the local path", () => {
    const result = buildRouterHandleInput({
      text: "crash on pay",
      imagePath: "/tmp/inbox/shot.jpg",
      voicePrompt: null,
      isForwarded: true,
      replyContext: null,
    });
    expect(result).toMatchObject({ isForwarded: true, hasImage: true });
    expect(result?.text).toBe("crash on pay");
    expect(result?.text).not.toContain("/tmp/");
    expect(result?.text).not.toContain("shot.jpg");
  });

  it("files a forwarded screenshot with empty text when there is no caption", () => {
    expect(
      buildRouterHandleInput({
        text: null,
        imagePath: "/tmp/inbox/shot.jpg",
        voicePrompt: null,
        isForwarded: true,
        replyContext: null,
      })
    ).toEqual({ text: "", isForwarded: true, hasImage: true });
  });

  it("honors hasImage when a forwarded screenshot has no local path", () => {
    expect(
      buildRouterHandleInput({
        text: null,
        imagePath: null,
        voicePrompt: null,
        isForwarded: true,
        replyContext: null,
        hasImage: true,
      })
    ).toEqual({ text: "", isForwarded: true, hasImage: true });
  });

  it("keeps a forwarded caption and honors hasImage without a local path", () => {
    expect(
      buildRouterHandleInput({
        text: "login crash",
        imagePath: null,
        voicePrompt: null,
        isForwarded: true,
        replyContext: null,
        hasImage: true,
      })
    ).toEqual({ text: "login crash", isForwarded: true, hasImage: true });
  });

  it("uses the voice transcript as forwarded issue source text", () => {
    const voicePrompt = "(voice note)\nlogin is broken";
    expect(
      buildRouterHandleInput({
        text: null,
        imagePath: null,
        voicePrompt,
        isForwarded: true,
        replyContext: null,
      })
    ).toEqual({
      text: voicePrompt,
      isForwarded: true,
      hasImage: false,
    });
  });

  it("builds today's agent prompt for a normal image that is not forwarded", () => {
    const input = {
      text: "what's wrong?",
      imagePath: "/tmp/shot.jpg",
      voicePrompt: null,
      isForwarded: false,
      replyContext: null,
    };
    const result = buildRouterHandleInput(input);
    expect(result).toMatchObject({ isForwarded: false, hasImage: true });
    expect(result?.text).toContain("/tmp/shot.jpg");
    expect(result?.text).toContain("what's wrong?");
    expect(result?.text).toBe(
      buildAgentPrompt({
        text: input.text,
        imagePath: input.imagePath,
        isForwarded: false,
      })
    );
  });

  it("passes a slash command through without merging reply context", () => {
    expect(
      buildRouterHandleInput({
        text: "/help",
        imagePath: null,
        voicePrompt: null,
        isForwarded: false,
        replyContext: "(ignored)",
      })
    ).toEqual({ text: "/help", isForwarded: false, hasImage: false });
  });

  it("merges quoted reply context into a normal message the same way as mergeReplyIntoPrompt", () => {
    const replyContext = "(Replying to bob:)\n```\nbug\n```";
    const result = buildRouterHandleInput({
      text: "fix it",
      imagePath: null,
      voicePrompt: null,
      isForwarded: false,
      replyContext,
    });
    expect(result?.text).toContain(replyContext);
    expect(result?.text).toContain("fix it");
  });

  it("returns null when there is nothing to send", () => {
    expect(
      buildRouterHandleInput({
        text: null,
        imagePath: null,
        voicePrompt: null,
        isForwarded: false,
        replyContext: null,
      })
    ).toBeNull();
  });
});
