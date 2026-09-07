import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { loadConfig, type AppConfig } from "./index.js";

describe("loadConfig casual access fields", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.ALLOWED_NUMBERS = "923001111111";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("populates casualNumbers from CASUAL_NUMBERS env var", () => {
    process.env.CASUAL_NUMBERS = "923003333333,923004444444";
    const config = loadConfig();
    expect(config.casualNumbers).toEqual(["923003333333", "923004444444"]);
  });

  it("defaults casualNumbers to [] when CASUAL_NUMBERS is not set", () => {
    // Empty string (not delete). loadEnvFile would refill from .env if undefined
    process.env.CASUAL_NUMBERS = "";
    const config = loadConfig();
    expect(config.casualNumbers).toEqual([]);
  });

  it("sets generalDir to join(rootDir, 'general')", () => {
    const config = loadConfig();
    expect(config.generalDir).toBe(join(config.rootDir, "general"));
  });
});
