import { join } from "node:path";
import { startWhatsAppBridge } from "./baileys/client.js";
import { assertAllowlistConfigured } from "./config/allowlist.js";
import { loadConfig } from "./config/index.js";
import { purgeOldFiles } from "./utils/housekeeping.js";

async function main(): Promise<void> {
  const config = loadConfig();
  assertAllowlistConfigured(config.allowedNumbers);

  const purged = purgeOldFiles({
    dirs: [join(config.historyDir, "inbox"), config.logsDir],
    retentionDays: config.retentionDays,
  });
  if (purged > 0) {
    console.log(`Housekeeping: removed ${purged} file(s) older than ${config.retentionDays}d`);
  }

  console.log("Cursor WhatsApp Bridge v1.0");
  console.log(`Projects file: ${config.projectsFile}`);
  console.log(`Auth dir: ${config.authDir}`);
  console.log(`Cursor binary: ${config.cursorBin}`);
  console.log(`Owner allowlist: ${config.allowedNumbers.join(", ")}`);
  if (config.casualNumbers.length > 0) {
    console.log(`Casual allowlist: ${config.casualNumbers.join(", ")}`);
  }
  console.log("Starting WhatsApp…");
  await startWhatsAppBridge(config);
}

// Baileys sometimes rejects after a disconnect; keep the process alive so
// our reconnect controller can continue instead of crashing on storms.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection (bridge staying up):", reason);
});

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
