import type { Env, TransactionType } from "../types";
import { WalletDb } from "../database/wallets";
import { TransactionDb } from "../database/transactions";
import { CONFIG } from "../config";

// =====================================================================
// EconomyService — تنها نقطه‌ی مجاز در کل پروژه برای تغییر موجودی کیف
// پول کاربران. هیچ Feature دیگری (بازی، مالیات، دادگاه، انعام و...)
// اجازه ندارد مستقیماً روی جدول wallets بنویسد؛ همه باید از اینجا عبور
// کنند تا:
//   ۱) موجودی هرگز منفی نشود
//   ۲) هر تغییر، دقیقاً یک رکورد Audit در transactions ثبت شود
//   ۳) تحت درخواست هم‌زمان (مثلاً دو بازی برای یک کاربر) داده خراب نشود
//      (با Optimistic Concurrency Control + Retry)
// =====================================================================

export type EconomyResult =
  | { ok: true; newBalance: number }
  | { ok: false; reason: "insufficient_balance" | "db_error" | "concurrency_conflict" };

const MAX_RETRIES = 5;

export const EconomyService = {
  /** خواندن موجودی فعلی (و ساخت کیف پول در صورت نبودن) */
  async getBalance(env: Env, userId: number): Promise<number | null> {
    await WalletDb.ensureExists(env, userId);
    const result = await WalletDb.getByUserId(env, userId);
    if (!result.ok || !result.data) return null;
    return result.data.balance;
  },

  /**
   * تغییر اتمیک موجودی.
   * delta مثبت = واریز، delta منفی = برداشت.
   * در صورت برداشت بیش از موجودی، عملیات رد می‌شود (موجودی هرگز منفی نمی‌شود).
   */
  async adjustBalance(
    env: Env,
    userId: number,
    delta: number,
    type: TransactionType,
    options?: { chatId?: number; reference?: string }
  ): Promise<EconomyResult> {
    await WalletDb.ensureExists(env, userId);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const currentResult = await WalletDb.getByUserId(env, userId);
      if (!currentResult.ok || !currentResult.data) {
        return { ok: false, reason: "db_error" };
      }

      const currentBalance = currentResult.data.balance;
      const newBalance = currentBalance + delta;

      if (newBalance < 0) {
        return { ok: false, reason: "insufficient_balance" };
      }

      try {
        const updateStmt = env.BOT_DB.prepare(
          `UPDATE wallets SET balance = ? WHERE user_id = ? AND balance = ?`
        ).bind(newBalance, userId, currentBalance);

        const insertStmt = TransactionDb.buildInsertStatement(
          env,
          userId,
          delta,
          type,
          newBalance,
          options?.chatId ?? null,
          options?.reference ?? null
        );

        // env.BOT_DB.batch اجرای هر دو Statement را در یک تراکنش واحد
        // SQLite تضمین می‌کند — یا هر دو اعمال می‌شوند یا هیچ‌کدام.
        const [updateResult] = await env.BOT_DB.batch([updateStmt, insertStmt]);
        const changes = (updateResult.meta as { changes?: number } | undefined)?.changes ?? 0;

        if (changes > 0) {
          return { ok: true, newBalance };
        }
        // موجودی توسط یک درخواست هم‌زمان دیگر تغییر کرده بود؛ دوباره تلاش کن
      } catch (err) {
        console.error("[EconomyService.adjustBalance] batch failed:", err);
        return { ok: false, reason: "db_error" };
      }
    }

    return { ok: false, reason: "concurrency_conflict" };
  },

  /** اطمینان از وجود کیف پول با موجودی اولیه‌ی پیکربندی‌شده برای کاربر جدید */
  async ensureInitialWallet(env: Env, userId: number): Promise<void> {
    await WalletDb.ensureExists(env, userId);
    void CONFIG.INITIAL_BALANCE; // مرجع صریح برای خوانایی — مقدار در WalletDb اعمال می‌شود
  },
};
