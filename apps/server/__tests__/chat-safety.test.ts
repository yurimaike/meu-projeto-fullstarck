import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../_core/db", () => ({ executeSql: vi.fn() }));
vi.mock("../services/booking-email", () => ({ notifyChatSafetyIncident: vi.fn().mockResolvedValue(true) }));

import { executeSql } from "../_core/db";
import { notifyChatSafetyIncident } from "../services/booking-email";
import { detectSeriousChatIncident, isChatVisitorBlocked, recordChatIncident } from "../services/chat-safety";

const sql = executeSql as ReturnType<typeof vi.fn>;

describe("chat safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sql.mockResolvedValue({ rows: [], rowsAffected: 1 });
  });

  it("detects explicit threats and marks them critical", () => {
    const incident = detectSeriousChatIncident([{ role: "user", content: "Vou te machucar quando te encontrar." }]);
    expect(incident?.severity).toBe("critical");
    expect(incident?.reason).toContain("Ameaça explícita");
  });

  it("does not treat a respectful complaint about price or delay as abuse", () => {
    expect(detectSeriousChatIncident([
      { role: "user", content: "Achei o preço alto." },
      { role: "user", content: "Estou chateada com o atraso." },
      { role: "user", content: "Não gostei do atendimento." }
    ])).toBeNull();
  });

  it("does not block a single insult without repeated behaviour", () => {
    expect(detectSeriousChatIncident([{ role: "user", content: "Você é uma vagabunda." }])).toBeNull();
  });

  it("flags two targeted insults when the latest message is also abusive", () => {
    const incident = detectSeriousChatIncident([
      { role: "user", content: "Sua vagabunda." },
      { role: "user", content: "Não gostei do preço." },
      { role: "user", content: "Sua vagabunda." }
    ]);
    expect(incident?.severity).toBe("high");
  });

  it("checks the persistent block table", async () => {
    sql.mockResolvedValueOnce({ rows: [{ visitor_id: "visitor-123" }], rowsAffected: 0 });
    await expect(isChatVisitorBlocked("visitor-123")).resolves.toBe(true);
    expect(sql).toHaveBeenCalledWith(expect.stringContaining("chat_safety_blocks"), ["visitor-123"]);
  });

  it("persists the incident and block and notifies administrators", async () => {
    const result = await recordChatIncident({
      visitorId: "visitor-123",
      severity: "critical",
      reason: "Ameaça explícita",
      excerpt: "Vou te machucar."
    });
    expect(result.id).toBeTruthy();
    expect(sql).toHaveBeenCalledTimes(3);
    expect(sql.mock.calls[0][0]).toContain("INSERT INTO chat_safety_incidents");
    expect(sql.mock.calls[1][0]).toContain("INSERT INTO chat_safety_blocks");
    expect(sql.mock.calls[2][0]).toContain("INSERT INTO chat_safety_block_history");
    expect(notifyChatSafetyIncident).toHaveBeenCalledWith(expect.objectContaining({ visitorId: "visitor-123", severity: "critical" }));
  });
});
