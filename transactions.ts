import type { Env, TransactionType } from "../types";
import { safeDbRun, DbResult } from "../utils/db";

// =====================================================================
// ثبت تاریخچه‌ی تراکنش‌ها (فقط Insert — هرگز Update/Delete روی این جدول
// انجام نمی‌شود تا Audit Trail کامل و قابل‌اعتماد بماند).
// این تابع فقط باید از داخل economy/economy.ts، در همان Batch اتمیک
// تغییر موجودی، فراخوانی شود.
// =====================================================================

export const TransactionDb = {
  buildInsertStatement(
    env: Env,
    userId: number,
    amount: number,
    type: TransactionType,
    balanceAfter: number,
    chatId: number | null,
    reference: string | null
  ) {
    return env.BOT_DB.prepare(
      `INSERT INTO transactions (user_id, amount, type, reference, chat_id, balance_after)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(userId, amount, type, reference, chatId, balanceAfter);
  },

  async listRecentForUser(
    env: Env,
    userId: number,
    limit = 10
  ): Promise<DbResult<{ amount: number; type: string; created_at: string }[]>> {
    return safeDbRun(async () => {
      const { results } = await env.BOT_DB.prepare(
        `SELECT amount, type, created_at FROM transactions
         WHERE user_id = ? ORDER BY id DESC LIMIT ?`
      )
        .bind(userId, limit)
        .all<{ amount: number; type: string; created_at: string }>();
      return results ?? [];
    }, "TransactionDb.listRecentForUser");
  },
};
