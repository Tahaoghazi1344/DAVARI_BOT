import type { Env, GroupRecord } from "../types";
import { safeDbRun, DbResult } from "../utils/db";

// =====================================================================
// عملیات دیتابیس مربوط به گروه‌ها.
// =====================================================================

export const GroupDb = {
  async upsert(env: Env, chatId: number, title: string): Promise<DbResult<GroupRecord>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(
        `INSERT INTO groups (chat_id, title)
         VALUES (?, ?)
         ON CONFLICT(chat_id) DO UPDATE SET title = excluded.title`
      )
        .bind(chatId, title)
        .run();

      const row = await env.BOT_DB.prepare(
        "SELECT chat_id, title, created_at FROM groups WHERE chat_id = ?"
      )
        .bind(chatId)
        .first<GroupRecord>();

      if (!row) throw new Error("group_upsert_failed_to_read_back");
      return row;
    }, "GroupDb.upsert");
  },

  async getById(env: Env, chatId: number): Promise<DbResult<GroupRecord | null>> {
    return safeDbRun(async () => {
      const row = await env.BOT_DB.prepare(
        "SELECT chat_id, title, created_at FROM groups WHERE chat_id = ?"
      )
        .bind(chatId)
        .first<GroupRecord>();
      return row ?? null;
    }, "GroupDb.getById");
  },
};
