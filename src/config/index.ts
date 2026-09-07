import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expandHome } from "../utils/path.js";
import { resolveAllowedNumbers, resolveCasualNumbers } from "./allowlist.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = resolve(__dirname, "../..");

export interface AppConfig {
  rootDir: string;
  projectsFile: string;
  historyDir: string;
  logsDir: string;
  authDir: string;
  stateFile: string;
  cursorBin: string;
  allowedNumbers: string[];
  casualNumbers: string[];
  generalDir: string;
  defaultProject: string | null;
  maxWhatsAppChars: number;
  appName: string;
  /** Kill a Cursor run after this many minutes (default 15). */
  cursorTimeoutMin: number;
  openaiApiKey: string | null;
  /** Delete inbox/log files older than this many days on startup (default 7). */
  retentionDays: number;
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function loadConfig(): AppConfig {
  loadEnvFile(join(ROOT_DIR, ".env"));

  return {
    rootDir: ROOT_DIR,
    projectsFile: join(ROOT_DIR, "projects.json"),
    historyDir: join(ROOT_DIR, "history"),
    logsDir: join(ROOT_DIR, "logs"),
    authDir: join(ROOT_DIR, "auth_info"),
    stateFile: join(ROOT_DIR, "state.json"),
    cursorBin: process.env.CURSOR_BIN?.trim() || "cursor",
    allowedNumbers: resolveAllowedNumbers(
      process.env.ALLOWED_NUMBERS,
      process.env.ADMIN_WHATSAPP_PHONE
    ),
    casualNumbers: resolveCasualNumbers(process.env.CASUAL_NUMBERS),
    generalDir: join(ROOT_DIR, "general"),
    defaultProject: process.env.DEFAULT_PROJECT?.trim() || null,
    maxWhatsAppChars: 4000,
    appName: process.env.APP_NAME?.trim() || "CursorWA",
    cursorTimeoutMin: Math.max(
      1,
      Number.parseInt(process.env.CURSOR_TIMEOUT_MIN?.trim() || "15", 10) || 15
    ),
    openaiApiKey: process.env.OPENAI_API_KEY?.trim() || null,
    retentionDays: Math.max(
      1,
      Number.parseInt(process.env.RETENTION_DAYS?.trim() || "7", 10) || 7
    ),
  };
}

export function resolveProjectPath(rawPath: string): string {
  return expandHome(rawPath);
}
