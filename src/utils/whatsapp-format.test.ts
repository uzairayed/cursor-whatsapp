import { describe, expect, it } from "vitest";
import { formatForWhatsApp } from "./whatsapp-format.js";

describe("formatForWhatsApp", () => {
  it("converts markdown bold to WhatsApp bold", () => {
    expect(formatForWhatsApp("Use **force** now")).toBe("Use *force* now");
  });

  it("converts markdown headings to bold lines", () => {
    expect(formatForWhatsApp("## Summary\nDone")).toBe("*Summary*\n\nDone");
  });

  it("normalizes bullet lists for WhatsApp", () => {
    const input = "- first\n- second\n* third";
    expect(formatForWhatsApp(input)).toBe("• first\n• second\n• third");
  });

  it("keeps fenced code blocks readable", () => {
    const input = "See:\n```ts\nconst x = 1;\n```\nDone";
    const out = formatForWhatsApp(input);
    expect(out).toContain("```");
    expect(out).toContain("const x = 1;");
    expect(out).toContain("Done");
  });

  it("collapses excessive blank lines", () => {
    expect(formatForWhatsApp("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("keeps bare URLs clickable (not wrapped in bold markers)", () => {
    const out = formatForWhatsApp(
      "PR opened:\nhttps://github.com/example/webapp/pull/35\nDone"
    );
    expect(out).toContain("\nhttps://github.com/example/webapp/pull/35\n");
    expect(out).not.toMatch(/\*https?:\/\//);
  });

  it("unwraps URLs that Cursor wrapped in markdown bold", () => {
    const out = formatForWhatsApp(
      "**https://github.com/example/webapp/pull/35**"
    );
    expect(out.trim()).toBe("https://github.com/example/webapp/pull/35");
  });

  it("turns markdown links into a label plus a bare URL on its own line", () => {
    const out = formatForWhatsApp(
      "See [the PR](https://github.com/example/webapp/pull/35) please"
    );
    expect(out).toContain("the PR");
    expect(out).toContain("\nhttps://github.com/example/webapp/pull/35\n");
    expect(out).not.toContain("](");
  });
});
