import type { Env, UserRecord } from "../types";
import { safeDbRun, DbResult } from "../utils/db";
import { WalletDb } from "./wallets";

// =====================================================================
// عملیات دیتابیس مربوط به کاربران.
// این ماژول تنها مسئول جدول users است؛ هیچ منطق Permission/Role/Wallet
// اینجا نباید نوشته شود (طبق اصل جداسازی مسئولیت‌ها).
// =====================================================================

export const UserDb = {
  async getById(env: Env, telegramId: number): Promise<DbResult<UserRecord | null>> {
    return safeDbRun(async () => {
      const row = await env.BOT_DB.prepare(
        "SELECT telegram_id, first_name, username, created_at FROM users WHERE telegram_id = ?"
      )
        .bind(telegramId)
        .first<UserRecord>();
      return row ?? null;
    }, "UserDb.getById");
  },

  /**
   * کاربر را در صورت نبودن ایجاد می‌کند و در صورت تغییر نام/یوزرنیم، به‌روزرسانی می‌کند.
   * همچنین کیف پول اولیه را (در صورت نبودن) می‌سازد.
   * این تابع باید در همان ابتدای Pipeline (User Resolver) صدا زده شود.
   */
  async upsert(
    env: Env,
    telegramId: number,
    firstName: string,
    username: string | null
  ): Promise<DbResult<UserRecord>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(
        `INSERT INTO users (telegram_id, first_name, username)
         VALUES (?, ?, ?)
         ON CONFLICT(telegram_id) DO UPDATE SET
           first_name = excluded.first_name,
           username = excluded.username`
      )
        .bind(telegramId, firstName, username)
        .run();

      // اطمینان از وجود کیف پول برای کاربر جدید (Idempotent)
      await WalletDb.ensureExists(env, telegramId);

      const row = await env.BOT_DB.prepare(
        "SELECT telegram_id, first_name, username, created_at FROM users WHERE telegram_id = ?"
      )
        .bind(telegramId)
        .first<UserRecord>();

      if (!row) throw new Error("user_upsert_failed_to_read_back");
      return row;
    }, "UserDb.upsert");
  },

  /** ثبت عضویت کاربر در یک گروه (اگر قبلاً ثبت نشده) */
  async linkToGroup(env: Env, userId: number, chatId: number): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(
        `INSERT INTO user_groups (user_id, chat_id)
         VALUES (?, ?)
         ON CONFLICT(user_id, chat_id) DO NOTHING`
      )
        .bind(userId, chatId)
        .run();
      return true as const;
    }, "UserDb.linkToGroup");
  },
};
