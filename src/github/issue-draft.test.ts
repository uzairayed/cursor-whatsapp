import { describe, expect, it } from "vitest";
import { buildIssueDraft } from "./issue-draft.js";

describe("buildIssueDraft", () => {
  it("uses the first non-empty line as the title, trimmed", () => {
    const draft = buildIssueDraft({
      text: "\n  Login fails on iOS  \n\nSteps: open the app and tap Sign in.",
    });
    expect(draft.title).toBe("Login fails on iOS");
  });

  it("truncates titles longer than 80 characters with an ellipsis", () => {
    const longLine = "A".repeat(90);
    const draft = buildIssueDraft({ text: longLine });
    expect(draft.title).toHaveLength(80);
    expect(draft.title.endsWith("…")).toBe(true);
  });

  it("titles an image-only message as WhatsApp screenshot", () => {
    const draft = buildIssueDraft({ text: null, hasImage: true });
    expect(draft.title).toBe("WhatsApp screenshot");
  });

  it("titles an empty message as WhatsApp note", () => {
    const draft = buildIssueDraft({ text: null });
    expect(draft.title).toBe("WhatsApp note");
  });

  it("puts the full source text and a WhatsApp footer in the body", () => {
    const text = "Login fails on iOS\n\nSteps: open the app and tap Sign in.";
    const draft = buildIssueDraft({ text });
    expect(draft.body).toContain(text);
    expect(draft.body).toContain("Filed from WhatsApp.");
  });

  it("notes an attached screenshot without leaking local file paths", () => {
    const draft = buildIssueDraft({
      text: "Crash after screenshot",
      hasImage: true,
    });
    expect(draft.body).toMatch(/screenshot/i);
    expect(draft.body).not.toMatch(/\/tmp\//);
    expect(draft.body).not.toMatch(/history\/inbox/);
  });

  it("embeds a GitHub user-attachments URL as a markdown image", () => {
    const imageUrl =
      "https://github.com/user-attachments/assets/01234567-89ab-cdef-0123-456789abcdef";
    const draft = buildIssueDraft({
      text: "Crash after screenshot",
      hasImage: true,
      imageUrl,
    });
    expect(draft.body).toContain(`![WhatsApp screenshot](${imageUrl})`);
  });

  it("uses the uploaded URL instead of a placeholder or local path", () => {
    const imageUrl =
      "https://github.com/user-attachments/assets/01234567-89ab-cdef-0123-456789abcdef";
    const draft = buildIssueDraft({
      text: "Crash after screenshot",
      hasImage: true,
      imageUrl,
    });
    expect(draft.body).not.toMatch(/\/tmp\//);
    expect(draft.body).not.toMatch(/history\/inbox/);
    expect(draft.body).not.toContain("A screenshot was attached.");
  });
});
