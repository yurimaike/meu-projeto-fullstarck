import { randomUUID } from "node:crypto";
import { executeSql } from "../_core/db";
import { notifyChatSafetyIncident } from "./booking-email";

export type ChatSeverity = "high" | "critical";
export type ChatIncident = { visitorId: string; severity: ChatSeverity; reason: string; excerpt: string };

const threatPatterns = [
  /\b(vou|vamos|queria|quero)\s+(te\s+)?(matar|machucar|agredir|espancar|atacar)\b/i,
  /\b(vou|vamos)\s+(atear fogo|quebrar tudo|invadir)\b/i,
  /\b(se\s+eu\s+te\s+encontrar|quando\s+eu\s+te\s+pegar)\b.{0,50}\b(matar|machucar|agredir|espancar)\b/i
];
const targetedAbuse = /\b(vadia|vagabunda| puta |put[ao]|desgra[cç]ada|arrombada| lixo humano| imunda)\b/i;

export function detectSeriousChatIncident(messages: Array<{ role: string; content: unknown }>): ChatIncident | null {
  const userMessages = messages.filter((m) => m.role === "user").slice(-8);
  const texts = userMessages.map((m) => typeof m.content === "string" ? m.content : "");
  const latest = texts.at(-1)?.trim() ?? "";
  if (!latest) return null;
  if (threatPatterns.some((pattern) => pattern.test(latest))) {
    return { visitorId: "", severity: "critical", reason: "Ameaça explícita de violência direcionada à profissional ou ao estabelecimento.", excerpt: latest.slice(0, 1200) };
  }
  const targetedCount = texts.filter((text) => targetedAbuse.test(text)).length;
  if (targetedAbuse.test(latest) && targetedCount >= 2) {
    return { visitorId: "", severity: "high", reason: "Comportamento agressivo reiterado com insultos direcionados.", excerpt: latest.slice(0, 1200) };
  }
  return null;
}

export async function isChatVisitorBlocked(visitorId: string) {
  const result = await executeSql("SELECT visitor_id FROM chat_safety_blocks WHERE visitor_id = ? AND unblocked_at IS NULL LIMIT 1", [visitorId]);
  return result.rows.length > 0;
}

export async function recordChatIncident(input: ChatIncident) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await executeSql("INSERT INTO chat_safety_incidents (id, visitor_id, severity, reason, message_excerpt) VALUES (?, ?, ?, ?, ?)", [id, input.visitorId, input.severity, input.reason, input.excerpt]);
  await executeSql("INSERT INTO chat_safety_blocks (visitor_id, reason) VALUES (?, ?) ON CONFLICT(visitor_id) DO UPDATE SET blocked_at = CURRENT_TIMESTAMP, blocked_by = 'automatic_safety_rule', reason = excluded.reason, unblocked_at = NULL, unblocked_by = NULL", [input.visitorId, input.reason]);
  await executeSql("INSERT INTO chat_safety_block_history (id, visitor_id, action, actor, reason) VALUES (?, ?, 'blocked', 'automatic_safety_rule', ?)", [randomUUID(), input.visitorId, input.reason]);
  void notifyChatSafetyIncident({ ...input, createdAt }).catch((error) => console.error("[chat-safety] admin email alert failed", error));
  return { id, createdAt };
}
