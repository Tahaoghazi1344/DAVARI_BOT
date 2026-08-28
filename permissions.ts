import type { Env, PermissionKey } from "../types";
import { safeDbRun, DbResult } from "../utils/db";

// =====================================================================
// عملیات خام دیتابیس روی Permissionهای هر کاربر در یک گروه مشخص.
// این جدول فقط «روشن/خاموش بودن» یک قابلیت برای یک رعیت خاص را نگه
// می‌دارد؛ تصمیم نهایی (چه کسی اصلاً مجاز است این کلید را ببیند) در
// telegram/permissions.ts گرفته می‌شود.
// =====================================================================

export const PermissionDb = {
  async isEnabled(
    env: Env,
    userId: number,
    chatId: number,
    key: PermissionKey
  ): Promise<DbResult<boolean>> {
    return safeDbRun(async () => {
      const row = await env.BOT_DB.prepare(
        `SELECT enabled FROM permissions WHERE user_id = ? AND chat_id = ? AND permission_key = ?`
      )
        .bind(userId, chatId, key)
        .first<{ enabled: number }>();
      return row ? row.enabled === 1 : false;
    }, "PermissionDb.isEnabled");
  },

  async setEnabled(
    env: Env,
    userId: number,
    chatId: number,
    key: PermissionKey,
    enabled: boolean
  ): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(
        `INSERT INTO permissions (user_id, chat_id, permission_key, enabled, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id, chat_id, permission_key) DO UPDATE SET
           enabled = excluded.enabled, updated_at = datetime('now')`
      )
        .bind(userId, chatId, key, enabled ? 1 : 0)
        .run();
      return true as const;
    }, "PermissionDb.setEnabled");
  },

  async listForUser(
    env: Env,
    userId: number,
    chatId: number
  ): Promise<DbResult<Record<string, boolean>>> {
    return safeDbRun(async () => {
      const { results } = await env.BOT_DB.prepare(
        `SELECT permission_key, enabled FROM permissions WHERE user_id = ? AND chat_id = ?`
      )
        .bind(userId, chatId)
        .all<{ permission_key: string; enabled: number }>();

      const map: Record<string, boolean> = {};
      for (const r of results ?? []) map[r.permission_key] = r.enabled === 1;
      return map;
    }, "PermissionDb.listForUser");
  },
};
