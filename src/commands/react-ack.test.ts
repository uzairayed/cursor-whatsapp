import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../config/index.js";
import { MessageRouter } from "./router.js";

function setup(): { config: AppConfig; workspace: string } {
  const root = mkdtempSync(join(tmpdir(), "cwa-react-"));
  const workspace = join(root, "crm");
  mkdirSync(workspace);
  writeFileSync(join(root, "projects.json"), JSON.stringify({ crm: workspace }));
  return {
    workspace,
    config: {
      rootDir: root,
      projectsFile: join(root, "projects.json"),
      historyDir: join(root, "history"),
      logsDir: join(root, "logs"),
      authDir: join(root, "auth_info"),
      stateFile: join(root, "state.json"),
      cursorBin: "cursor",
      allowedNumbers: ["1"],
      casualNumbers: [],
      generalDir: join(root, "general"),
      defaultProject: "crm",
      maxWhatsAppChars: 4000,
      appName: "CursorWA",
      cursorTimeoutMin: 15,
      openaiApiKey: null,
      retentionDays: 7,
    },
  };
}

describe("reaction ack", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reacts with eyes instead of sending the working text bubble", async () => {
    const { config, workspace } = setup();
    const router = new MessageRouter(config);
    const runner = router.runners.getRunnerFor(workspace);
    vi.spyOn(runner, "run").mockResolvedValue({
      stdout: "ok",
      stderr: "",
      exitCode: 0,
      durationSec: 1,
      chatId: null,
      cancelled: false,
      timedOut: false,
      usage: null,
    });

    const replies: string[] = [];
    const reacts: string[] = [];
    await router.handle(
      "refactor auth",
      async (t) => {
        replies.push(t);
      },
      {
        react: async (emoji) => {
          reacts.push(emoji);
        },
      }
    );

    expect(reacts).toEqual(["👀"]);
    expect(replies.some((r) => /on it|working in/i.test(r))).toBe(false);
    expect(replies.some((r) => r.includes("ok"))).toBe(true);
  });
});
