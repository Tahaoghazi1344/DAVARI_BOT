import type { Env, WalletRecord } from "../types";
import { safeDbRun, DbResult } from "../utils/db";
import { CONFIG } from "../config";

// =====================================================================
// عملیات خام دیتابیس روی کیف پول.
// توجه: این ماژول فقط CRUD خام روی جدول wallets است. منطق تراکنشی و
// Atomic (کسر/افزایش امن موجودی) در economy/economy.ts پیاده‌سازی شده،
// چون طبق قانون پروژه فقط Economy Service مجاز است موجودی را تغییر دهد.
// =====================================================================

export const WalletDb = {
  /** ساخت کیف پول با موجودی اولیه، در صورت نبودن (Idempotent) */
  async ensureExists(env: Env, userId: number): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(
        `INSERT INTO wallets (user_id, balance)
         VALUES (?, ?)
         ON CONFLICT(user_id) DO NOTHING`
      )
        .bind(userId, CONFIG.INITIAL_BALANCE)
        .run();
      return true as const;
    }, "WalletDb.ensureExists");
  },

  async getByUserId(env: Env, userId: number): Promise<DbResult<WalletRecord | null>> {
    return safeDbRun(async () => {
      const row = await env.BOT_DB.prepare(
        "SELECT user_id, balance, created_at FROM wallets WHERE user_id = ?"
      )
        .bind(userId)
        .first<WalletRecord>();
      return row ?? null;
    }, "WalletDb.getByUserId");
  },

  /**
   * به‌روزرسانی شرطی موجودی (Optimistic Concurrency Control).
   * فقط زمانی موفق می‌شود که موجودی فعلی هنوز برابر expectedCurrentBalance باشد؛
   * در غیر این صورت یعنی یک تراکنش هم‌زمان دیگر موجودی را تغییر داده و باید
   * توسط EconomyService دوباره تلاش شود (Retry).
   */
  async conditionalSetBalance(
    env: Env,
    userId: number,
    expectedCurrentBalance: number,
    newBalance: number
  ): Promise<DbResult<{ updated: boolean }>> {
    return safeDbRun(async () => {
      const result = await env.BOT_DB.prepare(
        `UPDATE wallets SET balance = ? WHERE user_id = ? AND balance = ?`
      )
        .bind(newBalance, userId, expectedCurrentBalance)
        .run();

      const changes = (result.meta as { changes?: number } | undefined)?.changes ?? 0;
      return { updated: changes > 0 };
    }, "WalletDb.conditionalSetBalance");
  },
};
