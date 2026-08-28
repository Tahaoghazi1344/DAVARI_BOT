import type { Env, MessageContext } from "../../types";
import { PermissionKey, Role } from "../../types";
import { CONFIG } from "../../config";
import { CourtDb, CourtRecord } from "../../database/court";
import { WarningDb } from "../../database/moderation";
import { SessionDb } from "../../database/sessions";
import { EconomyService } from "../../economy/economy";
import { TelegramApi } from "../../telegram/api";
import { Messages } from "../../telegram/messages";
import { requirePermission } from "../../telegram/router_helpers";
import { mentionHtml } from "../../utils/mention";

// =====================================================================
// دادگاه ⚖️ — State Machine کامل طبق متن اصلی (بخش‌های ۳۸ تا ۵۹):
// SETUP → ACTIVE (نوبت صحبت شاکی/متهم) → VERDICT (رأی قاضی) →
// PUNISHMENT (اجرای مجازات) → FINISHED.
// همه‌ی تصمیمات حساس (رأی، مجازات) فقط از سمت judge_id قابل انجام است
// و در هر Callback دوباره از دیتابیس بررسی می‌شود، نه از داده Client.
//
// ساده‌سازی مستند: در رأی «هردو مجرم»، همان یک نوع/مبلغ مجازات که قاضی
// انتخاب می‌کند برای هر دو طرف اعمال می‌شود (به‌جای دو انتخاب جداگانه).
// =====================================================================

const FINE_SESSION_TYPE = "court_fine_amount";

function verdictText(verdict: string, plaintiffName: string, defendantName: string): string {
  switch (verdict) {
    case "both_innocent":
      return Messages.court.bothInnocent;
    case "plaintiff_guilty":
      return Messages.court.plaintiffGuilty(plaintiffName);
    case "defendant_guilty":
      return Messages.court.defendantGuilty(defendantName);
    case "both_guilty":
      return Messages.court.bothGuilty;
    default:
      return "";
  }
}

function convictedTargets(court: CourtRecord): number[] {
  switch (court.verdict) {
    case "plaintiff_guilty":
      return [court.plaintiff_id];
    case "defendant_guilty":
      return court.defendant_id ? [court.defendant_id] : [];
    case "both_guilty":
      return court.defendant_id ? [court.plaintiff_id, court.defendant_id] : [court.plaintiff_id];
    default:
      return [];
  }
}

async function getUserName(env: Env, userId: number): Promise<string> {
  const row = await env.BOT_DB.prepare("SELECT first_name FROM users WHERE telegram_id = ?")
    .bind(userId)
    .first<{ first_name: string }>();
  return row?.first_name ?? "کاربر";
}

export const CourtFeature = {
  isOwnSession(ctx: MessageContext): boolean {
    return ctx.activeSession?.session_type === FINE_SESSION_TYPE;
  },

  async start(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId || ctx.isPrivateChat) return;
    const defendant = ctx.message?.reply_to_message?.from;
    if (!defendant) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.court.needsReply);
      return;
    }
    if (defendant.id === ctx.userId) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.court.cannotSueSelf);
      return;
    }
    if (!(await requirePermission(env, ctx, PermissionKey.COURT_USE, "دادگاه"))) return;

    const activeResult = await CourtDb.getActiveForChat(env, ctx.chatId);
    if (activeResult.ok && activeResult.data) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.court.alreadyActive);
      return;
    }

    // انتخاب قاضی: یکی از اعضای گروه به‌جز شاکی و متهم (ترجیحاً فرمانده در صورت وجود)
    const membersResult = await env.BOT_DB.prepare(
      `SELECT ug.user_id AS user_id, u.first_name AS first_name, COALESCE(r.is_commander,0) AS is_commander
       FROM user_groups ug JOIN users u ON u.telegram_id = ug.user_id
       LEFT JOIN roles r ON r.user_id = ug.user_id AND r.chat_id = ug.chat_id
       WHERE ug.chat_id = ? AND ug.user_id NOT IN (?, ?)`
    )
      .bind(ctx.chatId, ctx.userId, defendant.id)
      .all<{ user_id: number; first_name: string; is_commander: number }>();

    const candidates = membersResult.results ?? [];
    if (candidates.length === 0) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.court.notEnoughMembers);
      return;
    }
    const commanders = candidates.filter((c) => c.is_commander === 1);
    const pool = commanders.length > 0 ? commanders : candidates;
    const judge = pool[Math.floor(Math.random() * pool.length)];

    const speakOrder = Math.random() < 0.5 ? "plaintiff_first" : "defendant_first";
    const createResult = await CourtDb.create(env, ctx.chatId, ctx.userId, defendant.id, judge.user_id, speakOrder);
    if (!createResult.ok) return;

    const plaintiffName = ctx.message?.from?.first_name ?? "کاربر";
    await TelegramApi.sendMessage(
      env,
      ctx.chatId,
      Messages.court.opened(plaintiffName, defendant.first_name, judge.first_name),
      {
        keyboard: [
          [{ text: "🔨 شروع جلسه", callback_data: `court:begin:${createResult.data}` }],
          [{ text: "🚫 لغو دادگاه", callback_data: `court:cancel:${createResult.data}` }],
        ],
      }
    );
  },

  async cancel(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    const activeResult = await CourtDb.getActiveForChat(env, ctx.chatId);
    if (!activeResult.ok || !activeResult.data) return;
    const court = activeResult.data;

    if (ctx.userId !== court.plaintiff_id && ctx.userId !== court.judge_id && ctx.role !== Role.Owner) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.court.onlyJudgeOrPlaintiffCanCancel);
      return;
    }
    await CourtDb.setStatus(env, court.id, "CANCELLED");
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.court.cancelled);
  },

  async finishSpeaking(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    const activeResult = await CourtDb.getActiveForChat(env, ctx.chatId);
    if (!activeResult.ok || !activeResult.data) return;
    const court = activeResult.data;
    if (court.status !== "ACTIVE") return;

    const speakerUserId = court.current_speaker === "plaintiff" ? court.plaintiff_id : court.defendant_id;
    if (ctx.userId !== speakerUserId) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.court.notYourTurn);
      return;
    }

    const firstSpeaker = court.speak_order === "plaintiff_first" ? "plaintiff" : "defendant";
    const isFirstTurnEnding = court.current_speaker === firstSpeaker;

    if (isFirstTurnEnding) {
      const nextSpeaker = firstSpeaker === "plaintiff" ? "defendant" : "plaintiff";
      await CourtDb.setCurrentSpeaker(env, court.id, nextSpeaker);
      const nextUserId = nextSpeaker === "plaintiff" ? court.plaintiff_id : court.defendant_id!;
      const nextName = await getUserName(env, nextUserId);
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.court.turnSwitched(nextName));
      return;
    }

    // هر دو طرف صحبت کردند → مرحله رأی
    await CourtDb.setCurrentSpeaker(env, court.id, null);
    await CourtDb.setStatus(env, court.id, "VERDICT");
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.court.verdictPrompt, {
      keyboard: [
        [{ text: "متهم مجرم است", callback_data: `court:verdict:${court.id}:defendant_guilty` }],
        [{ text: "شاکی مجرم است", callback_data: `court:verdict:${court.id}:plaintiff_guilty` }],
        [{ text: "هر دو بی‌گناه", callback_data: `court:verdict:${court.id}:both_innocent` }],
        [{ text: "هر دو مجرم", callback_data: `court:verdict:${court.id}:both_guilty` }],
      ],
    });
  },

  async continueSession(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId || !ctx.message || !ctx.activeSession) return;
    const { courtId } = ctx.activeSession.data as { courtId?: number };
    await SessionDb.clear(env, ctx.userId, ctx.chatId);
    if (!courtId) return;

    const amount = Number((ctx.message.text ?? "").replace(/[^0-9]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.court.fineInvalid);
      return;
    }
    await applyFine(env, ctx.chatId, courtId, amount);
  },

  async handleCallback(env: Env, ctx: MessageContext): Promise<void> {
    const cq = ctx.callbackQuery;
    if (!cq || !cq.data || !ctx.chatId || !ctx.userId) return;
    const [, action, courtIdStr, extra] = cq.data.split(":");
    const courtId = Number(courtIdStr);
    const courtResult = await CourtDb.getById(env, courtId);
    if (!courtResult.ok || !courtResult.data) {
      await TelegramApi.answerCallbackQuery(env, cq.id, Messages.court.inactiveGame, true);
      return;
    }
    const court = courtResult.data;
    if (court.status === "FINISHED" || court.status === "CANCELLED") {
      await TelegramApi.answerCallbackQuery(env, cq.id, Messages.court.inactiveGame, true);
      return;
    }

    if (action === "begin") {
      if (ctx.userId !== court.judge_id) {
        await TelegramApi.answerCallbackQuery(env, cq.id, Messages.court.onlyJudgeCanStart, true);
        return;
      }
      await CourtDb.setStatus(env, court.id, "ACTIVE");
      const firstSpeaker = court.speak_order === "plaintiff_first" ? "plaintiff" : "defendant";
      const firstUserId = firstSpeaker === "plaintiff" ? court.plaintiff_id : court.defendant_id!;
      const firstName = await getUserName(env, firstUserId);
      await TelegramApi.answerCallbackQuery(env, cq.id, "جلسه آغاز شد.");
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.court.sessionStarted(firstName));
      return;
    }

    if (action === "cancel") {
      if (ctx.userId !== court.plaintiff_id && ctx.userId !== court.judge_id && ctx.role !== Role.Owner) {
        await TelegramApi.answerCallbackQuery(env, cq.id, Messages.court.onlyJudgeOrPlaintiffCanCancel, true);
        return;
      }
      await CourtDb.setStatus(env, court.id, "CANCELLED");
      await TelegramApi.answerCallbackQuery(env, cq.id, "لغو شد.");
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.court.cancelled);
      return;
    }

    if (action === "verdict") {
      if (ctx.userId !== court.judge_id) {
        await TelegramApi.answerCallbackQuery(env, cq.id, Messages.court.onlyJudgeCanVote, true);
        return;
      }
      const verdict = extra as "plaintiff_guilty" | "defendant_guilty" | "both_innocent" | "both_guilty";
      await CourtDb.setVerdict(env, court.id, verdict);

      const plaintiffName = await getUserName(env, court.plaintiff_id);
      const defendantName = await getUserName(env, court.defendant_id ?? 0);
      await TelegramApi.answerCallbackQuery(env, cq.id, "ثبت شد.");
      await TelegramApi.sendMessage(
        env,
        ctx.chatId,
        Messages.court.verdictAnnounced(verdictText(verdict, plaintiffName, defendantName))
      );

      if (verdict === "both_innocent") {
        await CourtDb.setStatus(env, court.id, "FINISHED");
        await TelegramApi.sendMessage(env, ctx.chatId, Messages.court.finished);
        return;
      }

      await TelegramApi.sendMessage(env, ctx.chatId, Messages.court.punishPrompt, {
        keyboard: [
          [{ text: "🚫 اخراج (Ban)", callback_data: `court:punish:${court.id}:ban` }],
          [{ text: "🔇 سکوت", callback_data: `court:punish:${court.id}:mute` }],
          [{ text: "💸 جریمه نقدی", callback_data: `court:punish:${court.id}:fine` }],
        ],
      });
      return;
    }

    if (action === "punish") {
      if (ctx.userId !== court.judge_id) {
        await TelegramApi.answerCallbackQuery(env, cq.id, Messages.court.onlyJudgeCanVote, true);
        return;
      }
      const type = extra as "ban" | "mute" | "fine";
      const targets = convictedTargets(court);

      if (type === "fine") {
        await SessionDb.start(env, ctx.userId, ctx.chatId, FINE_SESSION_TYPE, "amount", { courtId: court.id });
        await TelegramApi.answerCallbackQuery(env, cq.id, "منتظر مبلغ...");
        await TelegramApi.sendMessage(env, ctx.chatId, Messages.court.askFineAmount);
        return;
      }

      for (const targetId of targets) {
        const name = await getUserName(env, targetId);
        if (type === "ban") {
          await TelegramApi.banChatMember(env, ctx.chatId, targetId);
          await TelegramApi.sendMessage(env, ctx.chatId, Messages.moderation.banned(name));
        } else {
          await TelegramApi.muteChatMember(env, ctx.chatId, targetId);
          await TelegramApi.sendMessage(env, ctx.chatId, Messages.moderation.muted(name));
        }
        await CourtDb.recordPunishment(env, court.id, targetId, type, null, null);
      }
      await CourtDb.setStatus(env, court.id, "FINISHED");
      await TelegramApi.answerCallbackQuery(env, cq.id, "اجرا شد.");
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.court.finished);
    }
  },
};

async function applyFine(env: Env, chatId: number, courtId: number, amount: number): Promise<void> {
  const courtResult = await CourtDb.getById(env, courtId);
  if (!courtResult.ok || !courtResult.data) return;
  const court = courtResult.data;
  const targets = convictedTargets(court);

  for (const targetId of targets) {
    const balance = await EconomyService.getBalance(env, targetId);
    if (balance === null) continue;
    const deduct = Math.min(balance, amount);
    const result = await EconomyService.adjustBalance(env, targetId, -deduct, "court_fine", { chatId });
    if (!result.ok) continue;

    const name = mentionHtml(targetId, await getUserName(env, targetId));
    await CourtDb.recordPunishment(env, courtId, targetId, "fine", amount, deduct >= amount);

    if (deduct >= amount) {
      await WarningDb.decrement(env, targetId, chatId, "COURT");
      await TelegramApi.sendMessage(env, chatId, Messages.court.fineFullyPaid(name, deduct));
    } else {
      const warnResult = await WarningDb.increment(env, targetId, chatId, "COURT");
      const warnCount = warnResult.ok ? warnResult.data : 0;
      await TelegramApi.sendMessage(
        env,
        chatId,
        Messages.court.finePartiallyPaid(name, deduct, warnCount, CONFIG.COURT_MAX_WARNINGS)
      );
      if (warnCount >= CONFIG.COURT_MAX_WARNINGS) {
        await TelegramApi.banChatMember(env, chatId, targetId);
        await WarningDb.reset(env, targetId, chatId, "COURT");
        await TelegramApi.sendMessage(env, chatId, Messages.court.fineAutoBanned(name));
      }
    }
  }

  await CourtDb.setStatus(env, courtId, "FINISHED");
  await TelegramApi.sendMessage(env, chatId, Messages.court.finished);
}
