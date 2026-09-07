import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { GitHubIssueError, GitHubIssues } from "./issues.js";

function writeTempImage(name: string, bytes: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), "cwa-gh-attach-"));
  const filePath = join(dir, name);
  writeFileSync(filePath, bytes);
  return filePath;
}

describe("GitHubIssues", () => {
  it("invokes gh issue create with title, body, and workspace cwd", async () => {
    const runGh = vi.fn(() => ({
      status: 0,
      stdout: "https://github.com/acme/app/issues/12\n",
      stderr: "",
    }));
    const issues = new GitHubIssues(runGh);

    await issues.create({
      workspace: "/tmp/acme-app",
      title: "Login fails on iOS",
      body: "Steps: open the app.\n\nFiled from WhatsApp.",
    });

    expect(runGh).toHaveBeenCalledWith(
      [
        "issue",
        "create",
        "--title",
        "Login fails on iOS",
        "--body",
        "Steps: open the app.\n\nFiled from WhatsApp.",
      ],
      "/tmp/acme-app"
    );
  });

  it("returns the first http(s) URL from stdout on success", async () => {
    const runGh = vi.fn(() => ({
      status: 0,
      stdout: "https://github.com/acme/app/issues/12\n",
      stderr: "",
    }));
    const issues = new GitHubIssues(runGh);

    const result = await issues.create({
      workspace: "/tmp/acme-app",
      title: "Login fails on iOS",
      body: "Steps: open the app.\n\nFiled from WhatsApp.",
    });

    expect(result).toEqual({ url: "https://github.com/acme/app/issues/12" });
  });

  it("rejects with GitHubIssueError including stderr when gh fails", async () => {
    const withStderr = vi.fn(() => ({
      status: 1,
      stdout: "",
      stderr: "gh: Not logged in",
    }));
    await expect(
      new GitHubIssues(withStderr).create({
        workspace: "/tmp/acme-app",
        title: "Login fails on iOS",
        body: "Steps: open the app.\n\nFiled from WhatsApp.",
      })
    ).rejects.toThrow(GitHubIssueError);
    await expect(
      new GitHubIssues(withStderr).create({
        workspace: "/tmp/acme-app",
        title: "Login fails on iOS",
        body: "Steps: open the app.\n\nFiled from WhatsApp.",
      })
    ).rejects.toThrow(/gh: Not logged in/);

    const stdoutOnly = vi.fn(() => ({
      status: 1,
      stdout: "could not create issue: not a git repository",
      stderr: "",
    }));
    await expect(
      new GitHubIssues(stdoutOnly).create({
        workspace: "/tmp/acme-app",
        title: "Login fails on iOS",
        body: "Steps: open the app.\n\nFiled from WhatsApp.",
      })
    ).rejects.toThrow(/could not create issue: not a git repository/);
  });

  it("rejects with GitHubIssueError when success stdout has no URL", async () => {
    const runGh = vi.fn(() => ({
      status: 0,
      stdout: "Created issue but printed nothing useful\n",
      stderr: "",
    }));

    await expect(
      new GitHubIssues(runGh).create({
        workspace: "/tmp/acme-app",
        title: "Login fails on iOS",
        body: "Steps: open the app.\n\nFiled from WhatsApp.",
      })
    ).rejects.toThrow(GitHubIssueError);
  });

  it("attach uploads file bytes via token, numeric repo id, and postAttachment", async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const filePath = writeTempImage("shot.png", bytes);
    const runGh = vi.fn((args: string[]) => {
      if (args[0] === "auth") {
        return { status: 0, stdout: "  gho_token123\n", stderr: "" };
      }
      if (args[0] === "repo") {
        return { status: 0, stdout: " acme/app \n", stderr: "" };
      }
      return { status: 0, stdout: " 424242 \n", stderr: "" };
    });
    const postAttachment = vi.fn(async () => ({
      url: "https://github.com/user-attachments/assets/abc-123",
    }));
    const issues = new GitHubIssues(runGh, postAttachment);

    const result = await issues.attach({
      workspace: "/tmp/acme-app",
      filePath,
    });

    expect(runGh).toHaveBeenNthCalledWith(1, ["auth", "token"], "/tmp/acme-app");
    expect(runGh).toHaveBeenNthCalledWith(
      2,
      ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
      "/tmp/acme-app"
    );
    expect(runGh).toHaveBeenNthCalledWith(
      3,
      ["api", "repos/acme/app", "--jq", ".id"],
      "/tmp/acme-app"
    );
    expect(postAttachment).toHaveBeenCalledWith({
      token: "gho_token123",
      repositoryId: "424242",
      name: "shot.png",
      contentType: "image/png",
      bytes,
    });
    expect(result).toEqual({
      url: "https://github.com/user-attachments/assets/abc-123",
    });
  });

  it("attach uses image/jpeg for .jpg files", async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff]);
    const filePath = writeTempImage("photo.jpg", bytes);
    const runGh = vi.fn((args: string[]) => {
      if (args[0] === "auth") {
        return { status: 0, stdout: "gho_token123\n", stderr: "" };
      }
      if (args[0] === "repo") {
        return { status: 0, stdout: " acme/app \n", stderr: "" };
      }
      return { status: 0, stdout: " 424242 \n", stderr: "" };
    });
    const postAttachment = vi.fn(async () => ({
      url: "https://github.com/user-attachments/assets/jpg-1",
    }));
    const issues = new GitHubIssues(runGh, postAttachment);

    await issues.attach({ workspace: "/tmp/acme-app", filePath });

    expect(postAttachment).toHaveBeenCalledWith({
      token: "gho_token123",
      repositoryId: "424242",
      name: "photo.jpg",
      contentType: "image/jpeg",
      bytes,
    });
  });

  it("attach rejects with GitHubIssueError when auth token fails", async () => {
    const filePath = writeTempImage("shot.png", Buffer.from("png"));
    const runGh = vi.fn(() => ({
      status: 1,
      stdout: "",
      stderr: "gh: Not logged in",
    }));
    const postAttachment = vi.fn();
    const issues = new GitHubIssues(runGh, postAttachment);

    await expect(
      issues.attach({ workspace: "/tmp/acme-app", filePath })
    ).rejects.toThrow(GitHubIssueError);
    expect(postAttachment).not.toHaveBeenCalled();
  });

  it("attach rejects with GitHubIssueError when repo view fails", async () => {
    const filePath = writeTempImage("shot.png", Buffer.from("png"));
    const runGh = vi.fn((args: string[]) => {
      if (args[0] === "auth") {
        return { status: 0, stdout: "gho_token123\n", stderr: "" };
      }
      if (args.includes("nameWithOwner")) {
        return { status: 1, stdout: "", stderr: "gh: not a git repository" };
      }
      return { status: 0, stdout: " 424242 \n", stderr: "" };
    });
    const postAttachment = vi.fn();
    const issues = new GitHubIssues(runGh, postAttachment);

    await expect(
      issues.attach({ workspace: "/tmp/acme-app", filePath })
    ).rejects.toThrow(GitHubIssueError);
    expect(postAttachment).not.toHaveBeenCalled();
  });

  it("attach rejects with GitHubIssueError when repo api id lookup fails", async () => {
    const filePath = writeTempImage("shot.png", Buffer.from("png"));
    const runGh = vi.fn((args: string[]) => {
      if (args[0] === "auth") {
        return { status: 0, stdout: "gho_token123\n", stderr: "" };
      }
      if (args[0] === "repo") {
        return { status: 0, stdout: " acme/app \n", stderr: "" };
      }
      return { status: 1, stdout: "", stderr: "gh: HTTP 404" };
    });
    const postAttachment = vi.fn();
    const issues = new GitHubIssues(runGh, postAttachment);

    await expect(
      issues.attach({ workspace: "/tmp/acme-app", filePath })
    ).rejects.toThrow(GitHubIssueError);
    expect(postAttachment).not.toHaveBeenCalled();
  });

  it("attach wraps postAttachment rejection in GitHubIssueError", async () => {
    const filePath = writeTempImage("shot.png", Buffer.from("png"));
    const runGh = vi.fn((args: string[]) => {
      if (args[0] === "auth") {
        return { status: 0, stdout: "gho_token123\n", stderr: "" };
      }
      if (args[0] === "repo") {
        return { status: 0, stdout: " acme/app \n", stderr: "" };
      }
      return { status: 0, stdout: " 424242 \n", stderr: "" };
    });
    const postAttachment = vi.fn(async () => {
      throw new Error("uploads.github.com 401");
    });
    const issues = new GitHubIssues(runGh, postAttachment);

    const error = await issues
      .attach({ workspace: "/tmp/acme-app", filePath })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(GitHubIssueError);
    expect(error).toMatchObject({ message: expect.stringMatching(/uploads.github.com 401/) });
  });
});
