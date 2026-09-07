import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";

export type GhRunResult = { status: number | null; stdout: string; stderr: string };
export type GhRun = (args: string[], cwd: string) => GhRunResult;

export type PostAttachment = (opts: {
  token: string;
  repositoryId: string;
  name: string;
  contentType: string;
  bytes: Buffer;
}) => Promise<{ url: string }>;

export class GitHubIssueError extends Error {}

const URL_RE = /https?:\/\/\S+/;

function defaultRunGh(args: string[], cwd: string): GhRunResult {
  const result = spawnSync("gh", args, { cwd, encoding: "utf8" });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

async function defaultPostAttachment(opts: {
  token: string;
  repositoryId: string;
  name: string;
  contentType: string;
  bytes: Buffer;
}): Promise<{ url: string }> {
  const params = new URLSearchParams({
    name: opts.name,
    content_type: opts.contentType,
    repository_id: opts.repositoryId,
  });
  const response = await fetch(
    `https://uploads.github.com/user-attachments/assets?${params}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/octet-stream",
      },
      body: opts.bytes,
    }
  );
  const data = (await response.json()) as { url?: string };
  if (!data.url) throw new Error(`upload returned no URL (${response.status})`);
  return { url: data.url };
}

function contentTypeFor(name: string): string {
  return extname(name).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
}

export class GitHubIssues {
  private readonly runGh: GhRun;
  private readonly postAttachment: PostAttachment;

  constructor(runGh: GhRun = defaultRunGh, postAttachment: PostAttachment = defaultPostAttachment) {
    this.runGh = runGh;
    this.postAttachment = postAttachment;
  }

  async create(opts: {
    workspace: string;
    title: string;
    body: string;
  }): Promise<{ url: string }> {
    const result = this.runGh(
      ["issue", "create", "--title", opts.title, "--body", opts.body],
      opts.workspace
    );

    if (result.status !== 0) {
      throw new GitHubIssueError(result.stderr || result.stdout);
    }

    const match = result.stdout.match(URL_RE);
    if (!match) throw new GitHubIssueError("gh issue create returned no URL");
    return { url: match[0].trim() };
  }

  async attach(opts: { workspace: string; filePath: string }): Promise<{ url: string }> {
    const tokenResult = this.runGh(["auth", "token"], opts.workspace);
    if (tokenResult.status !== 0) {
      throw new GitHubIssueError(tokenResult.stderr || tokenResult.stdout);
    }

    const repoResult = this.runGh(
      ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
      opts.workspace
    );
    if (repoResult.status !== 0) {
      throw new GitHubIssueError(repoResult.stderr || repoResult.stdout);
    }

    const nameWithOwner = repoResult.stdout.trim();
    const idResult = this.runGh(
      ["api", `repos/${nameWithOwner}`, "--jq", ".id"],
      opts.workspace
    );
    if (idResult.status !== 0) {
      throw new GitHubIssueError(idResult.stderr || idResult.stdout);
    }

    const name = basename(opts.filePath);
    const bytes = readFileSync(opts.filePath);

    try {
      return await this.postAttachment({
        token: tokenResult.stdout.trim(),
        repositoryId: idResult.stdout.trim(),
        name,
        contentType: contentTypeFor(name),
        bytes,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new GitHubIssueError(message);
    }
  }
}
