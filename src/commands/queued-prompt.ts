import type { CursorExecutionMode } from "../cursor/runner.js";
import type { ReplyFn, ReactFn } from "./router.js";

export interface QueuedRunOptions {
  executionMode?: CursorExecutionMode;
  cursorPrompt?: string;
  skipPlanFirst?: boolean;
  sessionKey?: string;
  isCasual?: boolean;
  resume?: boolean;
}

export interface QueuedPrompt {
  prompt: string;
  reply: ReplyFn;
  react?: ReactFn;
  projectKey: string;
  workspace: string;
  runOpts?: QueuedRunOptions;
}
