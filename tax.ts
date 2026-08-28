import type { Env, MessageContext } from "../../types";
import { Role } from "../../types";
import { CONFIG } from "../../config";
import { TaxDb, WarningDb, ActionLogDb } from "../../database/moderation";
import { SessionDb } from "../../database/sessions";
import { EconomyService } from "../../economy/economy";
import { TelegramApi } from "../../telegram/api";
import { Messages } from "../../telegram/messages";
import { confirmCancelKeyboard } from "../../telegram/keyboards";
import { mentionHtml } from "../../utils/mention";

// =====================================================================
// مالیات — طبق متن اصلی، این یک عملیات گروهی است که فقط Owner می‌تواند
// شروع کند: «مالیات» → تأیید → فهرست مشمولین (نه Owner، نه Commander،
// نه معاف) → Owner یک عدد ثابت وارد می‌کند → همان مبلغ از همه کسر
// می‌شود. اگر موجودی کسی کافی نبود، فقط همان مقدار موجود کسر و یک
// اخطار مالیاتی ثبت می‌شود؛ در سومین اخطار، خودکار بن می‌شود.
// =====================================================================

const SESSION_TYPE = "tax_broadcast";

export const TaxFeature = {
  isOwnSession(ctx: MessageContext): boolean {
    return ctx.activeSession?.session_type === SESSION_TYPE;
  },

  async startBroadcast(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId || ctx.isPrivateChat) return;
    if (ctx.role !== Role.Owner) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.tax.onlyOwner);
      return;
    }

    await SessionDb.start(env, ctx.userId, ctx.chatId, SESSION_TYPE, "confirm");
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.tax.askConfirm, {
      keyboard: confirmCancelKeyboard("tax:confirm", "tax:cancel"),
    });
  },

  async setExempt(env: Env, ctx: MessageContext, exempt: boolean): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    const target = ctx.message?.reply_to_message?.from;
    if (!target) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.moderation.needsReply);
      return;
    }
    if (ctx.role !== Role.Owner) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.tax.onlyOwner);
      return;
    }

    await TaxDb.setExempt(env, target.id, ctx.chatId, exempt, ctx.userId);
    await ActionLogDb.log(env, ctx.chatId, ctx.userId, target.id, exempt ? "tax_exempt" : "tax_unexempt");
    await TelegramApi.sendMessage(
      env,
      ctx.chatId,
      exempt ? Messages.tax.exemptSet(target.first_name) : Messages.tax.exemptRemoved(target.first_name)
    );
  },

  /** دکمه‌های تأیید/لغو مرحله اول */
  async handleCallback(env: Env, ctx: MessageContext, action: "confirm" | "cancel"): Promise<string> {
    if (!ctx.chatId || !ctx.userId) return "خطا";
    if (ctx.role !== Role.Owner) return Messages.general.unauthorized;

    if (action === "cancel") {
      await SessionDb.clear(env, ctx.userId, ctx.chatId);
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.tax.cancelled);
      return "لغو شد.";
    }

    const listResult = await TaxDb.listTaxableMembers(env, ctx.chatId);
    if (!listResult.ok) return "خطا در دیتابیس.";

    const subjects = listResult.data.filter((m) => String(m.user_id) !== env.OWNER_ID);
    if (subjects.length === 0) {
      await SessionDb.clear(env, ctx.userId, ctx.chatId);
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.tax.noSubjects);
      return "کسی نیست.";
    }

    await SessionDb.updateStep(env, ctx.userId, ctx.chatId, "awaiting_amount", {
      subjectIds: subjects.map((s) => s.user_id),
    });

    const lines = subjects.map((s) => `• ${s.first_name} — ${s.balance.toLocaleString("fa-IR")} 🪙`);
    await TelegramApi.sendMessage(
      env,
      ctx.chatId,
      `${Messages.tax.subjectsListTitle}\n${lines.join("\n")}\n\n${Messages.tax.askAmount}`
    );
    return "لیست ارسال شد.";
  },

  /** مرحله دوم: دریافت مبلغ عددی و اجرای کسر */
  async continueSession(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId || !ctx.message || !ctx.activeSession) return;
    const session = ctx.activeSession;
    if (session.step !== "awaiting_amount") return;

    const raw = ctx.message.text?.trim() ?? "";
    const amount = Number(raw.replace(/[^0-9]/g, ""));

    // Session را فوراً پاک می‌کنیم تا در صورت Update تکراری، دوباره پردازش نشود (Idempotency)
    await SessionDb.clear(env, ctx.userId, ctx.chatId);

    if (!Number.isFinite(amount) || amount <= 0) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.tax.invalidAmount);
      return;
    }

    const subjectIds = (session.data as { subjectIds?: number[] }).subjectIds ?? [];
    let total = 0;
    let count = 0;

    for (const userId of subjectIds) {
      const balance = await EconomyService.getBalance(env, userId);
      if (balance === null) continue;

      const deduct = Math.min(balance, amount);
      if (deduct <= 0) continue;

      const result = await EconomyService.adjustBalance(env, userId, -deduct, "tax", { chatId: ctx.chatId });
      if (!result.ok) continue;

      total += deduct;
      count += 1;

      const nameRow = await env.BOT_DB.prepare("SELECT first_name FROM users WHERE telegram_id = ?")
        .bind(userId)
        .first<{ first_name: string }>();
      const name = mentionHtml(userId, nameRow?.first_name ?? "کاربر");

      if (deduct >= amount) {
        await WarningDb.decrement(env, userId, ctx.chatId, "TAX");
        await TelegramApi.sendMessage(env, ctx.chatId, Messages.tax.paid(name, deduct));
      } else {
        const warnCount = await WarningDb.increment(env, userId, ctx.chatId, "TAX");
        const warnValue = warnCount.ok ? warnCount.data : 0;
        await TelegramApi.sendMessage(
          env,
          ctx.chatId,
          Messages.tax.partiallyPaid(name, deduct, warnValue, CONFIG.TAX_MAX_WARNINGS)
        );

        if (warnValue >= CONFIG.TAX_MAX_WARNINGS) {
          await TelegramApi.banChatMember(env, ctx.chatId, userId);
          await WarningDb.reset(env, userId, ctx.chatId, "TAX");
          await ActionLogDb.log(env, ctx.chatId, ctx.userId, userId, "tax_auto_ban");
          await TelegramApi.sendMessage(env, ctx.chatId, Messages.tax.autoBanned(name));
        }
      }
    }

    await ActionLogDb.log(env, ctx.chatId, ctx.userId, null, "tax_collect", String(total));
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.tax.summary(total, count));
  },
};
