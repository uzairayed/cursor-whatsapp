import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveProjectPath, type AppConfig } from "../config/index.js";
import {
  DEFAULT_AGENT_MODE,
  parseAgentMode,
  type AgentMode,
} from "../orchestration/mode.js";
import type { PendingPlan } from "../orchestration/plan-first.js";
import { loadProjectsConfig, type ProjectsMap } from "./discover.js";

export type { ProjectsMap };
export type { AgentMode };
export type { PendingPlan };

export interface SessionState {
  currentProject: string | null;
  awaitingProjectPick?: boolean;
  agentMode?: AgentMode;
  pendingPlan?: PendingPlan | null;
}

export class ProjectStore {
  private projects: ProjectsMap = {};
  private state: SessionState = {
    currentProject: null,
    awaitingProjectPick: false,
    agentMode: DEFAULT_AGENT_MODE,
    pendingPlan: null,
  };

  constructor(private readonly config: AppConfig) {
    // Load persisted session before reload so defaults cannot clobber agentMode.
    this.loadState();
    this.reload();
  }

  reload(): void {
    if (!existsSync(this.config.projectsFile)) {
      writeFileSync(
        this.config.projectsFile,
        `${JSON.stringify({ dirs: [], exclude: [], aliases: {} }, null, 2)}\n`,
        "utf8"
      );
    }
    const raw = JSON.parse(readFileSync(this.config.projectsFile, "utf8")) as unknown;
    this.projects = loadProjectsConfig(raw);

    if (this.config.generalDir) {
      mkdirSync(this.config.generalDir, { recursive: true });
      if (!this.projects["general"]) {
        this.projects["general"] = this.config.generalDir;
      }
    }

    if (!this.state.currentProject && this.config.defaultProject) {
      const key = this.config.defaultProject.toLowerCase();
      if (this.projects[key]) {
        this.state.currentProject = key;
        this.saveState();
      }
    }
  }

  private loadState(): void {
    if (!existsSync(this.config.stateFile)) {
      this.state = {
        currentProject: this.config.defaultProject?.toLowerCase() ?? null,
        awaitingProjectPick: false,
        agentMode: DEFAULT_AGENT_MODE,
        pendingPlan: null,
      };
      this.saveState();
      return;
    }
    const loaded = JSON.parse(readFileSync(this.config.stateFile, "utf8")) as SessionState;
    this.state = {
      currentProject: loaded.currentProject ?? null,
      awaitingProjectPick: Boolean(loaded.awaitingProjectPick),
      agentMode: parseAgentMode(loaded.agentMode),
      pendingPlan: normalizePendingPlan(loaded.pendingPlan),
    };
  }

  private saveState(): void {
    writeFileSync(this.config.stateFile, `${JSON.stringify(this.state, null, 2)}\n`, "utf8");
  }

  list(): string[] {
    return Object.keys(this.projects).sort();
  }

  get(key: string): string | null {
    return this.projects[key.toLowerCase()] ?? null;
  }

  resolve(key: string): { key: string; path: string } | null {
    this.reload();
    const normalized = key.toLowerCase();
    const raw = this.projects[normalized];
    if (!raw) return null;
    return { key: normalized, path: resolveProjectPath(raw) };
  }

  setCurrent(key: string): { key: string; path: string } | null {
    const resolved = this.resolve(key);
    if (!resolved) return null;
    this.state.currentProject = resolved.key;
    this.state.awaitingProjectPick = false;
    this.saveState();
    mkdirSync(join(this.config.historyDir, resolved.key), { recursive: true });
    return resolved;
  }

  getCurrent(): { key: string; path: string; displayPath: string } | null {
    if (!this.state.currentProject) return null;
    const resolved = this.resolve(this.state.currentProject);
    if (!resolved) return null;
    return {
      ...resolved,
      displayPath: this.projects[resolved.key],
    };
  }

  formatList(): string {
    this.reload();
    const keys = this.list();
    if (keys.length === 0) return "(no projects configured in projects.json)";
    return keys.map((k) => k.toUpperCase()).join("\n");
  }

  formatPicker(): string {
    this.reload();
    const keys = this.list();
    if (keys.length === 0) return "No projects are configured yet.";
    return keys.map((k, i) => `${i + 1}. ${k.toUpperCase()}`).join("\n");
  }

  pickByNumber(n: number): { key: string; path: string } | null {
    this.reload();
    const keys = this.list();
    if (n < 1 || n > keys.length) return null;
    return this.setCurrent(keys[n - 1]!);
  }

  setAwaitingProjectPick(value: boolean): void {
    this.state.awaitingProjectPick = value;
    this.saveState();
  }

  isAwaitingProjectPick(): boolean {
    return Boolean(this.state.awaitingProjectPick);
  }

  getAgentMode(): AgentMode {
    return parseAgentMode(this.state.agentMode);
  }

  setAgentMode(mode: AgentMode): void {
    this.state.agentMode = mode;
    this.saveState();
  }

  getPendingPlan(): PendingPlan | null {
    return this.state.pendingPlan ?? null;
  }

  setPendingPlan(plan: PendingPlan | null): void {
    this.state.pendingPlan = plan;
    this.saveState();
  }
}

function normalizePendingPlan(raw: PendingPlan | null | undefined): PendingPlan | null {
  if (!raw || typeof raw !== "object") return null;
  if (
    typeof raw.projectKey !== "string" ||
    typeof raw.userPrompt !== "string" ||
    typeof raw.planText !== "string"
  ) {
    return null;
  }
  return {
    projectKey: raw.projectKey,
    userPrompt: raw.userPrompt,
    planText: raw.planText,
  };
}
