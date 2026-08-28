import type { Env } from "../types";
import { safeDbRun, DbResult } from "../utils/db";

export type CourtStatus = "SETUP" | "ACTIVE" | "VERDICT" | "PUNISHMENT" | "FINISHED" | "CANCELLED";
export type SpeakOrder = "plaintiff_first" | "defendant_first";
export type Verdict = "plaintiff_guilty" | "defendant_guilty" | "both_innocent" | "both_guilty";

export interface CourtRecord {
  id: number;
  chat_id: number;
  plaintiff_id: number;
  defendant_id: number | null;
  judge_id: number;
  status: CourtStatus;
  speak_order: SpeakOrder | null;
  current_speaker: "plaintiff" | "defendant" | null;
  verdict: Verdict | null;
}

export const CourtDb = {
  /** آیا در این گروه یک دادگاه فعال (غیر از FINISHED/CANCELLED) وجود دارد؟ */
  async getActiveForChat(env: Env, chatId: number): Promise<DbResult<CourtRecord | null>> {
    return safeDbRun(async () => {
      const row = await env.BOT_DB.prepare(
        `SELECT id, chat_id, plaintiff_id, defendant_id, judge_id, status, speak_order, current_speaker, verdict
         FROM courts WHERE chat_id = ? AND status NOT IN ('FINISHED','CANCELLED')
         ORDER BY id DESC LIMIT 1`
      )
        .bind(chatId)
        .first<CourtRecord>();
      return row ?? null;
    }, "CourtDb.getActiveForChat");
  },

  async getById(env: Env, id: number): Promise<DbResult<CourtRecord | null>> {
    return safeDbRun(async () => {
      const row = await env.BOT_DB.prepare(
        `SELECT id, chat_id, plaintiff_id, defendant_id, judge_id, status, speak_order, current_speaker, verdict
         FROM courts WHERE id = ?`
      )
        .bind(id)
        .first<CourtRecord>();
      return row ?? null;
    }, "CourtDb.getById");
  },

  async create(
    env: Env,
    chatId: number,
    plaintiffId: number,
    defendantId: number,
    judgeId: number,
    speakOrder: SpeakOrder
  ): Promise<DbResult<number>> {
    return safeDbRun(async () => {
      const currentSpeaker = speakOrder === "plaintiff_first" ? "plaintiff" : "defendant";
      const result = await env.BOT_DB.prepare(
        `INSERT INTO courts (chat_id, plaintiff_id, defendant_id, judge_id, status, speak_order, current_speaker)
         VALUES (?, ?, ?, ?, 'SETUP', ?, ?)`
      )
        .bind(chatId, plaintiffId, defendantId, judgeId, speakOrder, currentSpeaker)
        .run();
      return Number(result.meta.last_row_id);
    }, "CourtDb.create");
  },

  async setStatus(env: Env, id: number, status: CourtStatus): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(`UPDATE courts SET status = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(status, id)
        .run();
      return true as const;
    }, "CourtDb.setStatus");
  },

  async setCurrentSpeaker(env: Env, id: number, speaker: "plaintiff" | "defendant" | null): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(`UPDATE courts SET current_speaker = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(speaker, id)
        .run();
      return true as const;
    }, "CourtDb.setCurrentSpeaker");
  },

  async setVerdict(env: Env, id: number, verdict: Verdict): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(`UPDATE courts SET verdict = ?, status = 'PUNISHMENT', updated_at = datetime('now') WHERE id = ?`)
        .bind(verdict, id)
        .run();
      return true as const;
    }, "CourtDb.setVerdict");
  },

  async recordPunishment(
    env: Env,
    courtId: number,
    targetId: number,
    type: "ban" | "mute" | "fine",
    amount: number | null,
    paidFully: boolean | null
  ): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(
        `INSERT INTO court_punishments (court_id, target_id, punishment_type, amount, paid_fully)
         VALUES (?, ?, ?, ?, ?)`
      )
        .bind(courtId, targetId, type, amount, paidFully === null ? null : paidFully ? 1 : 0)
        .run();
      return true as const;
    }, "CourtDb.recordPunishment");
  },
};
