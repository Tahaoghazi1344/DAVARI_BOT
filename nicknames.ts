import type { Env } from "../types";
import { safeDbRun, DbResult } from "../utils/db";

export const NicknameDb = {
  async get(env: Env, userId: number, chatId: number): Promise<DbResult<string | null>> {
    return safeDbRun(async () => {
      const row = await env.BOT_DB.prepare(
        `SELECT nickname FROM nicknames WHERE user_id = ? AND chat_id = ?`
      )
        .bind(userId, chatId)
        .first<{ nickname: string }>();
      return row ? row.nickname : null;
    }, "NicknameDb.get");
  },

  async set(env: Env, userId: number, chatId: number, nickname: string, setBy: number): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(
        `INSERT INTO nicknames (user_id, chat_id, nickname, set_by, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id, chat_id) DO UPDATE SET
           nickname = excluded.nickname, set_by = excluded.set_by, updated_at = datetime('now')`
      )
        .bind(userId, chatId, nickname, setBy)
        .run();
      return true as const;
    }, "NicknameDb.set");
  },

  async clear(env: Env, userId: number, chatId: number): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(`DELETE FROM nicknames WHERE user_id = ? AND chat_id = ?`)
        .bind(userId, chatId)
        .run();
      return true as const;
    }, "NicknameDb.clear");
  },

  async listForChat(
    env: Env,
    chatId: number
  ): Promise<DbResult<{ user_id: number; nickname: string; first_name: string }[]>> {
    return safeDbRun(async () => {
      const { results } = await env.BOT_DB.prepare(
        `SELECT n.user_id AS user_id, n.nickname AS nickname, u.first_name AS first_name
         FROM nicknames n JOIN users u ON u.telegram_id = n.user_id
         WHERE n.chat_id = ? ORDER BY n.updated_at DESC`
      )
        .bind(chatId)
        .all<{ user_id: number; nickname: string; first_name: string }>();
      return results ?? [];
    }, "NicknameDb.listForChat");
  },
};
