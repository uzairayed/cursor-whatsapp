import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { transcribeAudio } from "./transcribe.js";

describe("transcribeAudio", () => {
  it("posts the file to OpenAI Whisper and returns the text", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cwa-whisper-"));
    const filePath = join(dir, "note.ogg");
    writeFileSync(filePath, Buffer.from("fake-audio"));

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: "fix the login bug" }),
    });

    const text = await transcribeAudio({
      apiKey: "sk-test",
      filePath,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(text).toBe("fix the login bug");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer sk-test",
    });
  });

  it("throws a clear error when the API rejects", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cwa-whisper-"));
    const filePath = join(dir, "note.ogg");
    writeFileSync(filePath, Buffer.from("fake-audio"));

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    });

    await expect(
      transcribeAudio({
        apiKey: "bad",
        filePath,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).rejects.toThrow(/whisper|transcri/i);
  });
});
