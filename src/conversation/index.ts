import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  at: string;
}

export interface ConversationState {
  project: string;
  chatId: string | null;
  messages: ConversationMessage[];
  updatedAt: string;
  lastInputTokens?: number;
}

export class ConversationManager {
  constructor(private readonly historyDir: string) {
    mkdirSync(historyDir, { recursive: true });
  }

  private dirFor(project: string): string {
    return join(this.historyDir, project.toLowerCase());
  }

  private fileFor(project: string): string {
    return join(this.dirFor(project), "conversation.json");
  }

  load(project: string): ConversationState {
    const file = this.fileFor(project);
    if (!existsSync(file)) {
      return {
        project: project.toLowerCase(),
        chatId: null,
        messages: [],
        updatedAt: new Date().toISOString(),
      };
    }
    return JSON.parse(readFileSync(file, "utf8")) as ConversationState;
  }

  save(state: ConversationState): void {
    mkdirSync(this.dirFor(state.project), { recursive: true });
    state.updatedAt = new Date().toISOString();
    writeFileSync(this.fileFor(state.project), `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  append(
    project: string,
    userPrompt: string,
    assistantReply: string,
    chatId?: string | null,
    usage?: { inputTokens: number }
  ): ConversationState {
    const state = this.load(project);
    state.messages.push(
      { role: "user", content: userPrompt, at: new Date().toISOString() },
      { role: "assistant", content: assistantReply, at: new Date().toISOString() }
    );
    if (chatId !== undefined) state.chatId = chatId;
    if (usage !== undefined) state.lastInputTokens = usage.inputTokens;
    if (state.messages.length > 200) {
      state.messages = state.messages.slice(-200);
    }
    this.save(state);
    return state;
  }

  setChatId(project: string, chatId: string | null): void {
    const state = this.load(project);
    state.chatId = chatId;
    this.save(state);
  }

  getChatId(project: string): string | null {
    return this.load(project).chatId;
  }
}
