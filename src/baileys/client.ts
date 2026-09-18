/**
 * Baileys client: multi-file auth in auth_info/, fetchLatestBaileysVersion,
 * browser identity, QR via qrcode-terminal, reconnect on close, clear auth
 * on loggedOut.
 *
 * Also handles WhatsApp LID addressing (@lid + remoteJidAlt).
 */
import {
  fetchLatestBaileysVersion,
  makeWASocket,
  useMultiFileAuthState,
  type ConnectionState,
  type WAMessage,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import pino from "pino";
import qrcode from "qrcode-terminal";
import type { AppConfig } from "../config/index.js";
import { MessageRouter } from "../commands/router.js";
import { resolveAccessRole } from "../config/allowlist.js";
import { phoneFromJid } from "../utils/jid.js";
import { resolveReplyJid } from "../utils/reply-jid.js";
import { isDirectChat, resolveSenderPhone } from "../utils/sender.js";
import { phoneFromLidCache, rememberLidPhone } from "./lid-cache.js";
import { buildConversationKey } from "./conversation-key.js";
import {
  buildRouterHandleInput,
  buildVoicePrompt,
  getMessageContent,
  getQuotedContextInfo,
} from "./message-content.js";
import { extractQuotedContext, formatQuotedContext } from "./reply-context.js";
import { ReconnectController, sleep } from "./reconnect.js";
import { saveWhatsAppAudio } from "./save-audio.js";
import { saveWhatsAppImage } from "./save-image.js";
import {
  clearActive,
  getActive,
  sendTextWithRetry,
  setActive,
} from "./socket-holder.js";
import { transcribeAudio } from "./transcribe.js";
import { shouldHandleUpsertType } from "./upsert-type.js";

const logger = pino({ level: "silent" });
const reconnect = new ReconnectController();

function clearAuthDir(authDir: string): void {
  if (!existsSync(authDir)) return;
  for (const entry of readdirSync(authDir)) {
    rmSync(join(authDir, entry), { recursive: true, force: true });
  }
}

export async function startWhatsAppBridge(config: AppConfig): Promise<void> {
  const router = new MessageRouter(config);
  await connect(config, router);
}

async function connect(
  config: AppConfig,
  router: MessageRouter,
  opts: { claimed?: boolean } = {}
): Promise<void> {
  if (!opts.claimed && !reconnect.tryBeginConnect()) return;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: [config.appName, "Chrome", "1.0.0"],
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });
    setActive(sock);

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log("\n========================================");
        console.log("  Scan this QR code with WhatsApp:");
        console.log("  (Linked Devices)");
        console.log("========================================\n");
        qrcode.generate(qr, { small: true });
      }

      if (connection === "open") {
        setActive(sock);
        reconnect.recordOpen();
        const phone = sock.user?.id?.split(":")[0] || sock.user?.id || "unknown";
        console.log(`WhatsApp connected as ${phone}.`);
      }

      if (connection === "close") {
        const status = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;

        clearActive();
        reconnect.endConnect();
        if (!reconnect.tryBeginConnect()) return;

        const decision = reconnect.decideAfterClose(status);

        if (decision.action === "stop") {
          reconnect.endConnect();
          console.error(`WhatsApp stopped reconnecting: ${decision.reason}`);
          return;
        }

        if (decision.action === "reauth") {
          console.log("WhatsApp session logged out. Clearing auth and generating fresh QR…");
          clearAuthDir(config.authDir);
          void connect(config, router, { claimed: true });
          return;
        }

        const secs = Math.round(decision.delayMs / 1000);
        if (decision.action === "conflict") {
          console.warn(
            `Connection replaced (440). ${decision.reason}. Retry in ${secs}s. Unlink other Linked Devices if this repeats.`
          );
        } else if (decision.action === "cooldown") {
          console.warn(`Reconnect storm detected. Cooling down ${secs}s before retry…`);
        } else {
          console.log(
            `Connection closed (code: ${status}). Reconnecting in ${secs}s…`
          );
        }

        void sleep(decision.delayMs)
          .then(() => connect(config, router, { claimed: true }))
          .catch((err) => {
            reconnect.endConnect();
            console.error("Reconnect failed:", err);
          });
      }
    });

    sock.ev.on(
      "messages.upsert",
      async ({ messages, type }: { messages: WAMessage[]; type: string }) => {
        for (const msg of messages) {
          try {
            await onMessage(sock, msg, config, router, type);
          } catch (err) {
            console.error("Failed to handle message:", err);
          }
        }
      }
    );
  } catch (err) {
    reconnect.endConnect();
    throw err;
  }
}

async function resolvePhoneWithLidMap(
  sock: WASocket,
  msg: WAMessage
): Promise<string | null> {
  const direct = resolveSenderPhone(msg);
  if (direct) return direct;

  const cached = phoneFromLidCache(msg.key?.remoteJid);
  if (cached) return cached;

  const remote = msg.key?.remoteJid;
  if (!remote?.endsWith("@lid")) return null;

  try {
    const mapping = (
      sock as WASocket & {
        signalRepository?: { lidMapping?: { getPNForLID?: (lid: string) => Promise<string | null> } };
      }
    ).signalRepository?.lidMapping;

    const pn = mapping?.getPNForLID ? await mapping.getPNForLID(remote) : null;
    if (pn) return phoneFromJid(pn) || null;
  } catch (err) {
    console.warn("LID→PN lookup failed:", err);
  }
  return null;
}

async function onMessage(
  sock: WASocket,
  msg: WAMessage,
  config: AppConfig,
  router: MessageRouter,
  type: string
): Promise<void> {
  if (msg.key.fromMe) return;
  if (!msg.message) return;
  if (!isDirectChat(msg)) return;

  if (!shouldHandleUpsertType(type)) return;

  // Always reply on the live chat JID (often @lid). Phone is only for allowlist.
  const chatJid = msg.key.remoteJid;
  if (!chatJid) return;

  const phone = await resolvePhoneWithLidMap(sock, msg);
  rememberLidPhone(chatJid, phone);

  console.log(
    `[msg type=${type}] remoteJid=${chatJid} alt=${(msg.key as { remoteJidAlt?: string }).remoteJidAlt ?? "-"} phone=${phone ?? "-"}`
  );

  const accessRole = resolveAccessRole(phone, config.allowedNumbers, config.casualNumbers);
  if (accessRole === "denied") {
    console.log(`Ignored unauthorized sender phone=${phone ?? "unknown"} jid=${chatJid}`);
    return;
  }

  const content = getMessageContent(msg);
  if (!content.text && !content.hasImage && !content.hasAudio) {
    console.log("Ignored: no text, image, or audio body");
    return;
  }

  // Slash commands stay text-only (ignore attached media for /help etc.)
  if (content.text?.startsWith("/")) {
    // fall through with text only
  }

  const inbox = join(config.historyDir, "inbox");
  let imagePath: string | null = null;
  if (content.hasImage && !content.text?.startsWith("/")) {
    try {
      imagePath = await saveWhatsAppImage(sock, msg, inbox);
      console.log(`Saved WhatsApp image → ${imagePath}`);
    } catch (err) {
      console.error("Failed to download image:", err);
      await sock.sendMessage(chatJid, {
        text: "Couldn't download that image. Try sending it again (not as view-once).",
      });
      return;
    }
  }

  let voicePrompt: string | null = null;
  if (content.hasAudio && !content.text?.startsWith("/")) {
    if (!config.openaiApiKey) {
      await sock.sendMessage(chatJid, {
        text: "Got a voice note, but OPENAI_API_KEY isn't set, so I can't transcribe it.",
      });
      return;
    }
    try {
      const audioPath = await saveWhatsAppAudio(sock, msg, inbox);
      console.log(`Saved WhatsApp audio → ${audioPath}`);
      const transcript = await transcribeAudio({
        apiKey: config.openaiApiKey,
        filePath: audioPath,
      });
      voicePrompt = buildVoicePrompt(transcript, content.text);
      console.log(`Voice transcript: ${transcript.slice(0, 100)}`);
    } catch (err) {
      console.error("Failed to transcribe voice note:", err);
      await sock.sendMessage(chatJid, {
        text: "Couldn't transcribe that voice note. Try again or send it as text.",
      });
      return;
    }
  }

  // Extract reply context from quoted messages
  const ctxInfo = getQuotedContextInfo(msg);
  const quoted = extractQuotedContext(ctxInfo);
  const replyContext = quoted ? formatQuotedContext(quoted) : null;

  const input = buildRouterHandleInput({
    text: content.text,
    imagePath,
    voicePrompt,
    isForwarded: content.isForwarded,
    replyContext,
    hasImage: content.hasImage,
  });

  if (!input) {
    console.log("Ignored: empty prompt");
    return;
  }

  const replyJid = resolveReplyJid({
    senderJid: chatJid,
    phone,
  });

  const reply = async (body: string) => {
    try {
      console.log(`→ ${replyJid}: ${body.slice(0, 80)}`);
      await sendTextWithRetry(replyJid, body);
      console.log(`→ sent ok`);
    } catch (err) {
      console.error(`→ send failed to ${replyJid}:`, err);
      throw err;
    }
  };

  const react = async (emoji: string) => {
    if (!msg.key) return;
    await getActive().sendMessage(replyJid, {
      react: { text: emoji, key: msg.key },
    });
  };

  const label = content.isForwarded ? "fwd " : "";
  console.log(
    `← ${label}${phone ?? chatJid}: ${content.hasImage ? "[image] " : ""}${content.text?.slice(0, 100) ?? "(no caption)"}`
  );
  await router.handle(input.text, reply, {
    react,
    access: accessRole,
    conversationKey: buildConversationKey(phone, chatJid),
    isForwarded: input.isForwarded,
    hasImage: input.hasImage,
    imagePath: imagePath ?? undefined,
  });
}
