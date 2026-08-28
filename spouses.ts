import type { Env } from "../types";
import { safeDbRun, DbResult } from "../utils/db";
import type { ResponseKind } from "./words";

// =====================================================================
// «همسر» طبق متن اصلی یعنی مجموعه‌ای شخصی از محتوا (متن/عکس/گیف/...)
// که هر کاربر برای خودش در هر گروه ثبت می‌کند؛ با نوشتن «همسر من» یکی
// از آیتم‌ها به‌صورت تصادفی نمایش داده می‌شود.
// =====================================================================

export interface SpouseItem {
  id: number;
  kind: ResponseKind;
  text_content: string | null;
  file_id: string | null;
}

export const SpouseDb = {
  async addItem(
    env: Env,
    userId: number,
    chatId: number,
    kind: ResponseKind,
    textContent?: string,
    fileId?: string
  ): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(
        `INSERT INTO spouse_items (user_id, chat_id, kind, text_content, file_id) VALUES (?, ?, ?, ?, ?)`
      )
        .bind(userId, chatId, kind, textContent ?? null, fileId ?? null)
        .run();
      return true as const;
    }, "SpouseDb.addItem");
  },

  async count(env: Env, userId: number, chatId: number): Promise<DbResult<number>> {
    return safeDbRun(async () => {
      const row = await env.BOT_DB.prepare(
        `SELECT COUNT(*) AS c FROM spouse_items WHERE user_id = ? AND chat_id = ?`
      )
        .bind(userId, chatId)
        .first<{ c: number }>();
      return row?.c ?? 0;
    }, "SpouseDb.count");
  },

  async getRandomItem(env: Env, userId: number, chatId: number): Promise<DbResult<SpouseItem | null>> {
    return safeDbRun(async () => {
      const row = await env.BOT_DB.prepare(
        `SELECT id, kind, text_content, file_id FROM spouse_items
         WHERE user_id = ? AND chat_id = ? ORDER BY RANDOM() LIMIT 1`
      )
        .bind(userId, chatId)
        .first<SpouseItem>();
      return row ?? null;
    }, "SpouseDb.getRandomItem");
  },

  async clearAll(env: Env, userId: number, chatId: number): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(`DELETE FROM spouse_items WHERE user_id = ? AND chat_id = ?`)
        .bind(userId, chatId)
        .run();
      return true as const;
    }, "SpouseDb.clearAll");
  },
};
