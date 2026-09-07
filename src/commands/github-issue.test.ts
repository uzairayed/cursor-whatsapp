import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../config/index.js";
import { GitHubIssueError } from "../github/issues.js";
import { MessageRouter } from "./router.js";
import {
  buildBusyStatusMessage,
  buildIdleStatusMessage,
} from "./status-messages.js";

function setup(overrides: { defaultProject?: string | null } = {}): {
  config: AppConfig;
  workspace: string;
  generalWorkspace: string;
} {
  const root = mkdtempSync(join(tmpdir(), "cwa-router-"));
  const workspace = join(root, "crm");
  const generalWorkspace = join(root, "general");
  mkdirSync(workspace);
  mkdirSync(generalWorkspace);
  writeFileSync(
    join(root, "projects.json"),
    JSON.stringify({ crm: workspace })
  );
  return {
    workspace,
    generalWorkspace,
    config: {
      rootDir: root,
      projectsFile: join(root, "projects.json"),
      historyDir: join(root, "history"),
      logsDir: join(root, "logs"),
      authDir: join(root, "auth_info"),
      stateFile: join(root, "state.json"),
      cursorBin: "cursor",
      allowedNumbers: [],
      casualNumbers: [],
      generalDir: generalWorkspace,
      defaultProject:
        overrides.defaultProject !== undefined ? overrides.defaultProject : "crm",
      maxWhatsAppChars: 50,
      appName: "CursorWA",
      cursorTimeoutMin: 15,
      openaiApiKey: null,
      retentionDays: 7,
    },
  };
}

function stubIssueCreate(
  router: MessageRouter,
  url = "https://github.com/acme/crm/issues/12"
) {
  return vi.spyOn(router.issues, "create").mockResolvedValue({ url });
}

function stubIssueAttach(
  router: MessageRouter,
  url = "https://github.com/user-attachments/assets/abc-123"
) {
  return vi.spyOn(router.issues, "attach").mockResolvedValue({ url });
}

function stubCursorRun(router: MessageRouter, workspace: string) {
  return vi.spyOn(router.runners.getRunnerFor(workspace), "run").mockResolvedValue({
    stdout: "cursor-should-not-run",
    stderr: "",
    exitCode: 0,
    durationSec: 1,
    chatId: null,
    cancelled: false,
    timedOut: false,
    usage: null,
  });
}

describe("MessageRouter GitHub issue filing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("issue <text> files an issue", async () => {
    const { config, workspace } = setup();
    const router = new MessageRouter(config);
    const create = stubIssueCreate(router);
    const run = stubCursorRun(router, workspace);

    const replies: string[] = [];
    await router.handle(
      "issue Login fails on iOS\n\nSteps: tap Sign in",
      async (t) => {
        replies.push(t);
      }
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace,
        title: "Login fails on iOS",
      })
    );
    const body = create.mock.calls[0]![0].body;
    expect(body).toContain("Login fails on iOS");
    expect(body).toContain("Steps: tap Sign in");
    expect(body).toContain("Filed from WhatsApp.");
    expect(replies.join("\n")).toContain("https://github.com/acme/crm/issues/12");
    expect(run).not.toHaveBeenCalled();
  });

  it("empty issue asks what to file", async () => {
    const { config, workspace } = setup();
    const router = new MessageRouter(config);
    const create = stubIssueCreate(router);
    const run = stubCursorRun(router, workspace);

    const replies: string[] = [];
    const reply = async (t: string) => {
      replies.push(t);
    };

    await router.handle("issue", reply);
    await router.handle("/issue", reply);

    expect(create).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(replies.join("\n")).toMatch(/forward/i);
    expect(replies.join("\n")).toMatch(/issue <text>|issue …|issue \.\.\./i);
  });

  it("forwarded message files an issue", async () => {
    const { config, workspace } = setup();
    const router = new MessageRouter(config);
    const create = stubIssueCreate(router);
    const run = stubCursorRun(router, workspace);

    const replies: string[] = [];
    await router.handle("Customer: checkout 500s on pay", async (t) => {
      replies.push(t);
    }, { isForwarded: true });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace,
        title: "Customer: checkout 500s on pay",
      })
    );
    expect(create.mock.calls[0]![0].body).toContain(
      "Customer: checkout 500s on pay"
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("forwarded status is an issue, not the status command", async () => {
    const { config, workspace } = setup();
    const router = new MessageRouter(config);
    const create = stubIssueCreate(router);
    const run = stubCursorRun(router, workspace);

    const replies: string[] = [];
    await router.handle("status", async (t) => {
      replies.push(t);
    }, { isForwarded: true });

    expect(create).toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    const text = replies.join("\n");
    expect(text).not.toBe(buildIdleStatusMessage());
    expect(text).not.toBe(buildBusyStatusMessage("crm"));
    expect(text).not.toMatch(/i'm free right now|still working/i);
  });

  it("image-only forward without imagePath does not create an empty issue", async () => {
    const { config, workspace } = setup();
    const router = new MessageRouter(config);
    const create = stubIssueCreate(router);
    const run = stubCursorRun(router, workspace);

    const replies: string[] = [];
    await router.handle("", async (t) => {
      replies.push(t);
    }, { isForwarded: true, hasImage: true });

    expect(create).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(replies.join("\n")).toMatch(/screenshot|upload|image/i);
  });

  it("forwarded screenshot with imagePath uploads and embeds", async () => {
    const { config, workspace } = setup();
    const router = new MessageRouter(config);
    const attach = stubIssueAttach(router);
    const create = stubIssueCreate(router);
    const run = stubCursorRun(router, workspace);

    const replies: string[] = [];
    await router.handle("", async (t) => {
      replies.push(t);
    }, {
      isForwarded: true,
      hasImage: true,
      imagePath: "/tmp/inbox/shot.jpg",
    });

    expect(attach).toHaveBeenCalledWith({
      workspace,
      filePath: "/tmp/inbox/shot.jpg",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace,
        title: "WhatsApp screenshot",
      })
    );
    const body = create.mock.calls[0]![0].body;
    expect(body).toContain(
      "![WhatsApp screenshot](https://github.com/user-attachments/assets/abc-123)"
    );
    expect(body).toContain("Filed from WhatsApp.");
    expect(body).not.toContain("/tmp/");
    expect(body).not.toContain("history/inbox");
    expect(run).not.toHaveBeenCalled();
    expect(replies.join("\n")).toContain("https://github.com/acme/crm/issues/12");
  });

  it("caption plus screenshot embeds both the text and uploaded image", async () => {
    const { config, workspace } = setup();
    const router = new MessageRouter(config);
    const attach = stubIssueAttach(router);
    const create = stubIssueCreate(router);
    const run = stubCursorRun(router, workspace);

    await router.handle("animal picker is wrong", async () => {}, {
      isForwarded: true,
      hasImage: true,
      imagePath: "/tmp/shot.png",
    });

    expect(attach).toHaveBeenCalledWith({
      workspace,
      filePath: "/tmp/shot.png",
    });
    const body = create.mock.calls[0]![0].body;
    expect(body).toContain("animal picker is wrong");
    expect(body).toContain(
      "https://github.com/user-attachments/assets/abc-123"
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("attach failure does not create an issue", async () => {
    const { config, workspace } = setup();
    const router = new MessageRouter(config);
    vi.spyOn(router.issues, "attach").mockRejectedValue(
      new GitHubIssueError("upload failed")
    );
    const create = stubIssueCreate(router);
    const run = stubCursorRun(router, workspace);

    const replies: string[] = [];
    await router.handle("", async (t) => {
      replies.push(t);
    }, {
      isForwarded: true,
      hasImage: true,
      imagePath: "/tmp/inbox/shot.jpg",
    });

    expect(create).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(replies.join("\n")).toMatch(/github|upload/i);
  });

  it("no project selected asks which project", async () => {
    const { config, workspace } = setup({ defaultProject: null });
    const router = new MessageRouter(config);
    expect(router.projects.getCurrent()).toBeNull();

    const create = stubIssueCreate(router);
    const run = stubCursorRun(router, workspace);

    const replies: string[] = [];
    await router.handle("issue login broken", async (t) => {
      replies.push(t);
    });

    expect(create).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(replies.join("\n")).toMatch(/which project/i);
  });

  it("general project refuses to file", async () => {
    const { config, workspace, generalWorkspace } = setup();
    const router = new MessageRouter(config);
    router.projects.setCurrent("general");

    const create = stubIssueCreate(router);
    const crmRun = stubCursorRun(router, workspace);
    const generalRun = stubCursorRun(router, generalWorkspace);

    const replies: string[] = [];
    await router.handle("issue login broken", async (t) => {
      replies.push(t);
    });

    expect(create).not.toHaveBeenCalled();
    expect(crmRun).not.toHaveBeenCalled();
    expect(generalRun).not.toHaveBeenCalled();
    expect(replies.join("\n")).toMatch(/general|github/i);
  });

  it("casual access cannot file issues", async () => {
    const { config, workspace, generalWorkspace } = setup();
    const router = new MessageRouter(config);
    const create = stubIssueCreate(router);
    const crmRun = stubCursorRun(router, workspace);
    const generalRun = stubCursorRun(router, generalWorkspace);

    const replies: string[] = [];
    const reply = async (t: string) => {
      replies.push(t);
    };

    await router.handle("issue login broken", reply, { access: "casual" });
    await router.handle("Customer: checkout 500s", reply, {
      isForwarded: true,
      access: "casual",
    });

    expect(create).not.toHaveBeenCalled();
    expect(crmRun).not.toHaveBeenCalled();
    expect(generalRun).not.toHaveBeenCalled();
    expect(replies.length).toBeGreaterThanOrEqual(2);
    for (const text of replies) {
      expect(text).toMatch(/casual|can't file|cannot file|not allowed|github/i);
    }
  });

  it("replies with a short error when gh fails", async () => {
    const { config, workspace } = setup();
    const router = new MessageRouter(config);
    const create = vi
      .spyOn(router.issues, "create")
      .mockRejectedValue(new GitHubIssueError("gh: Not logged in"));
    const run = stubCursorRun(router, workspace);

    const replies: string[] = [];
    await router.handle("issue login broken", async (t) => {
      replies.push(t);
    });

    expect(create).toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(replies.join("\n")).toMatch(/github|not logged in/i);
  });

  it("files immediately even when the workspace is busy", async () => {
    const { config, workspace } = setup();
    const router = new MessageRouter(config);
    router.runners.markRunning(workspace, "crm");

    const create = stubIssueCreate(router);
    const run = stubCursorRun(router, workspace);

    const replies: string[] = [];
    await router.handle("issue login broken", async (t) => {
      replies.push(t);
    });

    expect(create).toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(replies.join("\n")).not.toMatch(/queued/i);
  });
});
