import type { Env, SessionRecord } from "../types";
import { safeDbRun, DbResult } from "../utils/db";
import { CONFIG } from "../config";

// =====================================================================
// هر کاربر در هر گروه حداکثر یک Session فعال چندمرحله‌ای دارد (مثلاً
// «در حال ثبت همسر»، «در حال تعیین مالیات»، «در دادگاه»). این جدول به
// Router اجازه می‌دهد پیام بعدی کاربر را به‌جای Command جدید، به‌عنوان
// ادامه‌ی همان جریان تفسیر کند.
// =====================================================================

export const SessionDb = {
  async get(env: Env, userId: number, chatId: number): Promise<DbResult<SessionRecord | null>> {
    return safeDbRun(async () => {
      interface RawSessionRow {
        user_id: number;
        chat_id: number;
        session_type: string;
        step: string;
        data: string; // JSON خام، هنوز Parse نشده
        created_at: string;
        updated_at: string;
        expires_at: string | null;
      }

      const row = await env.BOT_DB.prepare(
        `SELECT user_id, chat_id, session_type, step, data, created_at, updated_at, expires_at
         FROM sessions WHERE user_id = ? AND chat_id = ?`
      )
        .bind(userId, chatId)
        .first<RawSessionRow>();

      if (!row) return null;

      // بررسی انقضا — اگر منقضی شده، به‌عنوان نبودن Session در نظر گرفته می‌شود
      if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
        return null;
      }

      const parsedData: Record<string, unknown> = JSON.parse(row.data || "{}");
      const session: SessionRecord = { ...row, data: parsedData };
      return session;
    }, "SessionDb.get");
  },

  async start(
    env: Env,
    userId: number,
    chatId: number,
    sessionType: string,
    step: string,
    data: Record<string, unknown> = {},
    timeoutMs: number = CONFIG.SESSION_TIMEOUT_MS
  ): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      const expiresAt = new Date(Date.now() + timeoutMs).toISOString();
      await env.BOT_DB.prepare(
        `INSERT INTO sessions (user_id, chat_id, session_type, step, data, updated_at, expires_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'), ?)
         ON CONFLICT(user_id, chat_id) DO UPDATE SET
           session_type = excluded.session_type,
           step = excluded.step,
           data = excluded.data,
           updated_at = datetime('now'),
           expires_at = excluded.expires_at`
      )
        .bind(userId, chatId, sessionType, step, JSON.stringify(data), expiresAt)
        .run();
      return true as const;
    }, "SessionDb.start");
  },

  async updateStep(
    env: Env,
    userId: number,
    chatId: number,
    step: string,
    data: Record<string, unknown>
  ): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(
        `UPDATE sessions SET step = ?, data = ?, updated_at = datetime('now')
         WHERE user_id = ? AND chat_id = ?`
      )
        .bind(step, JSON.stringify(data), userId, chatId)
        .run();
      return true as const;
    }, "SessionDb.updateStep");
  },

  async clear(env: Env, userId: number, chatId: number): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(`DELETE FROM sessions WHERE user_id = ? AND chat_id = ?`)
        .bind(userId, chatId)
        .run();
      return true as const;
    }, "SessionDb.clear");
  },
};
