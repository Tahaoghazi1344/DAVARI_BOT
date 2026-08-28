import type { Env } from "../types";
import { safeDbRun, DbResult } from "../utils/db";

// =====================================================================
// اخطار — اکنون Type-Aware است (مثلاً 'TAX' یا 'COURT') چون طبق متن
// اصلی، اخطار مالیاتی و اخطار عمومی باید مستقل از هم شمارش شوند.
// =====================================================================

export type WarningType = "TAX" | "COURT" | "GENERAL";

export const WarningDb = {
  async get(env: Env, userId: number, chatId: number, type: WarningType): Promise<DbResult<number>> {
    return safeDbRun(async () => {
      const row = await env.BOT_DB.prepare(
        `SELECT count FROM warnings WHERE user_id = ? AND chat_id = ? AND type = ?`
      )
        .bind(userId, chatId, type)
        .first<{ count: number }>();
      return row?.count ?? 0;
    }, "WarningDb.get");
  },

  async increment(env: Env, userId: number, chatId: number, type: WarningType): Promise<DbResult<number>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(
        `INSERT INTO warnings (user_id, chat_id, type, count, updated_at)
         VALUES (?, ?, ?, 1, datetime('now'))
         ON CONFLICT(user_id, chat_id, type) DO UPDATE SET
           count = count + 1, updated_at = datetime('now')`
      )
        .bind(userId, chatId, type)
        .run();

      const row = await env.BOT_DB.prepare(
        `SELECT count FROM warnings WHERE user_id = ? AND chat_id = ? AND type = ?`
      )
        .bind(userId, chatId, type)
        .first<{ count: number }>();
      return row?.count ?? 0;
    }, "WarningDb.increment");
  },

  /** کاهش یک واحد اخطار (مثلاً بعد از پرداخت موفق مالیات) — هرگز کمتر از صفر */
  async decrement(env: Env, userId: number, chatId: number, type: WarningType): Promise<DbResult<number>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(
        `UPDATE warnings SET count = MAX(0, count - 1), updated_at = datetime('now')
         WHERE user_id = ? AND chat_id = ? AND type = ?`
      )
        .bind(userId, chatId, type)
        .run();
      const row = await env.BOT_DB.prepare(
        `SELECT count FROM warnings WHERE user_id = ? AND chat_id = ? AND type = ?`
      )
        .bind(userId, chatId, type)
        .first<{ count: number }>();
      return row?.count ?? 0;
    }, "WarningDb.decrement");
  },

  async reset(env: Env, userId: number, chatId: number, type: WarningType): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(`DELETE FROM warnings WHERE user_id = ? AND chat_id = ? AND type = ?`)
        .bind(userId, chatId, type)
        .run();
      return true as const;
    }, "WarningDb.reset");
  },
};

// =====================================================================
// مالیات — طبق متن اصلی، نرخ درصدی جداگانه برای هرکس وجود ندارد؛ فقط
// یک وضعیت «معاف / غیرمعاف» ذخیره می‌شود. مبلغ مالیات در لحظه‌ی اجرا،
// توسط Owner به‌صورت یک عدد ثابت برای همه‌ی مشمولین وارد می‌شود.
// =====================================================================

export const TaxDb = {
  async isExempt(env: Env, userId: number, chatId: number): Promise<DbResult<boolean>> {
    return safeDbRun(async () => {
      const row = await env.BOT_DB.prepare(
        `SELECT exempt FROM tax_status WHERE user_id = ? AND chat_id = ?`
      )
        .bind(userId, chatId)
        .first<{ exempt: number }>();
      return row ? row.exempt === 1 : false;
    }, "TaxDb.isExempt");
  },

  async setExempt(env: Env, userId: number, chatId: number, exempt: boolean, setBy: number): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(
        `INSERT INTO tax_status (user_id, chat_id, exempt, set_by, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id, chat_id) DO UPDATE SET
           exempt = excluded.exempt, set_by = excluded.set_by, updated_at = datetime('now')`
      )
        .bind(userId, chatId, exempt ? 1 : 0, setBy)
        .run();
      return true as const;
    }, "TaxDb.setExempt");
  },

  /** فهرست تمام کاربران عضو گروه که مشمول مالیات‌اند (نه Commander، نه معاف — Owner در لایه‌ی Feature حذف می‌شود) */
  async listTaxableMembers(
    env: Env,
    chatId: number
  ): Promise<DbResult<{ user_id: number; first_name: string; balance: number }[]>> {
    return safeDbRun(async () => {
      const { results } = await env.BOT_DB.prepare(
        `SELECT ug.user_id AS user_id, u.first_name AS first_name, w.balance AS balance
         FROM user_groups ug
         JOIN users u ON u.telegram_id = ug.user_id
         LEFT JOIN wallets w ON w.user_id = ug.user_id
         LEFT JOIN roles r ON r.user_id = ug.user_id AND r.chat_id = ug.chat_id
         LEFT JOIN tax_status t ON t.user_id = ug.user_id AND t.chat_id = ug.chat_id
         WHERE ug.chat_id = ?
           AND COALESCE(r.is_commander, 0) = 0
           AND COALESCE(t.exempt, 0) = 0`
      )
        .bind(chatId)
        .all<{ user_id: number; first_name: string; balance: number | null }>();

      return (results ?? []).map((r) => ({ ...r, balance: r.balance ?? 0 }));
    }, "TaxDb.listTaxableMembers");
  },
};

export const ActionLogDb = {
  async log(
    env: Env,
    chatId: number,
    actorId: number,
    targetId: number | null,
    actionType: string,
    details?: string
  ): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(
        `INSERT INTO action_logs (chat_id, actor_id, target_id, action_type, details)
         VALUES (?, ?, ?, ?, ?)`
      )
        .bind(chatId, actorId, targetId, actionType, details ?? null)
        .run();
      return true as const;
    }, "ActionLogDb.log");
  },

  async listForTarget(
    env: Env,
    chatId: number,
    targetId: number,
    limit = 15
  ): Promise<DbResult<{ action_type: string; details: string | null; created_at: string; actor_id: number }[]>> {
    return safeDbRun(async () => {
      const { results } = await env.BOT_DB.prepare(
        `SELECT action_type, details, created_at, actor_id FROM action_logs
         WHERE chat_id = ? AND target_id = ? ORDER BY id DESC LIMIT ?`
      )
        .bind(chatId, targetId, limit)
        .all<{ action_type: string; details: string | null; created_at: string; actor_id: number }>();
      return results ?? [];
    }, "ActionLogDb.listForTarget");
  },
};
