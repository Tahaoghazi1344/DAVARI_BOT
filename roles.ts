import type { Env, RoleRecord } from "../types";
import { safeDbRun, DbResult } from "../utils/db";

// =====================================================================
// عملیات خام دیتابیس روی نقش‌های کاربر در یک گروه مشخص.
// فرمانده و رعیت متقابلاً انحصاری‌اند (نمی‌توان هر دو را هم‌زمان داشت) —
// این محدودیت هم در سطح دیتابیس (CHECK) و هم اینجا اعمال می‌شود.
// =====================================================================

export const RoleDb = {
  async getInGroup(env: Env, userId: number, chatId: number): Promise<DbResult<RoleRecord | null>> {
    return safeDbRun(async () => {
      const row = await env.BOT_DB.prepare(
        `SELECT user_id, chat_id, is_commander, is_serf, updated_at
         FROM roles WHERE user_id = ? AND chat_id = ?`
      )
        .bind(userId, chatId)
        .first<RoleRecord>();
      return row ?? null;
    }, "RoleDb.getInGroup");
  },

  async setCommander(env: Env, userId: number, chatId: number): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(
        `INSERT INTO roles (user_id, chat_id, is_commander, is_serf, updated_at)
         VALUES (?, ?, 1, 0, datetime('now'))
         ON CONFLICT(user_id, chat_id) DO UPDATE SET
           is_commander = 1, is_serf = 0, updated_at = datetime('now')`
      )
        .bind(userId, chatId)
        .run();
      return true as const;
    }, "RoleDb.setCommander");
  },

  async setSerf(env: Env, userId: number, chatId: number): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(
        `INSERT INTO roles (user_id, chat_id, is_commander, is_serf, updated_at)
         VALUES (?, ?, 0, 1, datetime('now'))
         ON CONFLICT(user_id, chat_id) DO UPDATE SET
           is_commander = 0, is_serf = 1, updated_at = datetime('now')`
      )
        .bind(userId, chatId)
        .run();
      return true as const;
    }, "RoleDb.setSerf");
  },

  async clearRole(env: Env, userId: number, chatId: number): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(
        `INSERT INTO roles (user_id, chat_id, is_commander, is_serf, updated_at)
         VALUES (?, ?, 0, 0, datetime('now'))
         ON CONFLICT(user_id, chat_id) DO UPDATE SET
           is_commander = 0, is_serf = 0, updated_at = datetime('now')`
      )
        .bind(userId, chatId)
        .run();
      return true as const;
    }, "RoleDb.clearRole");
  },
};
