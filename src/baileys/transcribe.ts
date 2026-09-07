import { readFileSync } from "node:fs";
import { basename } from "node:path";

export async function transcribeAudio(opts: {
  apiKey: string;
  filePath: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const bytes = readFileSync(opts.filePath);
  const form = new FormData();
  form.append("model", "whisper-1");
  form.append(
    "file",
    new Blob([new Uint8Array(bytes)]),
    basename(opts.filePath)
  );

  const res = await fetchImpl("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Whisper transcription failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`
    );
  }

  const data = (await res.json()) as { text?: string };
  const text = data.text?.trim();
  if (!text) throw new Error("Whisper transcription returned empty text");
  return text;
}
