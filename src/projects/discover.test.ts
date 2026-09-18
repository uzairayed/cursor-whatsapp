import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverProjectsFromDirs, loadProjectsConfig } from "./discover.js";

function makeTree(): { root: string; a: string; b: string; skip: string } {
  const root = mkdtempSync(join(tmpdir(), "cwa-discover-"));
  const a = join(root, "WebApp");
  const b = join(root, "Mobile");
  const skip = join(root, "notes");
  const hidden = join(root, ".hidden");
  mkdirSync(a);
  mkdirSync(b);
  mkdirSync(skip);
  mkdirSync(hidden);
  writeFileSync(join(a, "package.json"), "{}");
  writeFileSync(join(b, ".git"), ""); // file is enough for our check via exists
  // skip has neither package.json nor .git
  return { root, a, b, skip };
}

describe("discoverProjectsFromDirs", () => {
  it("picks immediate subfolders that look like projects", () => {
    const { root, a, b } = makeTree();
    const found = discoverProjectsFromDirs([root], []);
    expect(found).toEqual({
      webapp: a,
      mobile: b,
    });
  });

  it("honors exclude names", () => {
    const { root, b } = makeTree();
    const found = discoverProjectsFromDirs([root], ["webapp"]);
    expect(found).toEqual({ mobile: b });
  });
});

describe("loadProjectsConfig", () => {
  it("keeps legacy flat map format", () => {
    expect(
      loadProjectsConfig({
        webapp: "/tmp/demo-webapp",
      })
    ).toEqual({ webapp: "/tmp/demo-webapp" });
  });

  it("merges scanned dirs with explicit aliases (aliases win on key clash)", () => {
    const { root, a } = makeTree();
    const custom = join(root, "custom-web");
    mkdirSync(custom);
    const found = loadProjectsConfig({
      dirs: [root],
      exclude: ["mobile"],
      aliases: {
        webapp: custom,
        docs: "/tmp/demo-docs",
      },
    });
    expect(found.webapp).toBe(custom);
    expect(found.docs).toBe("/tmp/demo-docs");
    expect(found.mobile).toBeUndefined();
  });
});
