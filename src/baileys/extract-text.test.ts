import { describe, expect, it } from "vitest";
import { extractText } from "./extract-text.js";

describe("extractText", () => {
  it("reads conversation text", () => {
    expect(
      extractText({
        message: { conversation: "hello" },
      } as never)
    ).toBe("hello");
  });

  it("reads extended text and captions", () => {
    expect(
      extractText({
        message: { extendedTextMessage: { text: "hi" } },
      } as never)
    ).toBe("hi");
    expect(
      extractText({
        message: { imageMessage: { caption: "cap" } },
      } as never)
    ).toBe("cap");
  });

  it("returns null when no text body", () => {
    expect(extractText({ message: { stickerMessage: {} } } as never)).toBeNull();
    expect(extractText({} as never)).toBeNull();
  });
});
