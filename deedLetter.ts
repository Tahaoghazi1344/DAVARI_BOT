import type { Env, MessageContext, InlineKeyboard } from "../types";
import { Role } from "../types";
import { EconomyService } from "../economy/economy";
import { NicknameDb } from "../database/nicknames";
import { WarningDb, ActionLogDb } from "../database/moderation";
import { RoleDb } from "../database/roles";
import { TelegramApi } from "../telegram/api";
import { Messages } from "../telegram/messages";
import { resolveRole, roleLabel } from "../telegram/permissions";
import { CONFIG } from "../config";
import { SpouseFeature } from "../features/spouse/spouse";
import { TaxFeature } from "../features/tax/tax";

// =====================================================================
// نامه اعمال — طبق متن اصلی (بخش ۱۱ و بخش ۶۹) این پنل فقط در اختیار
// Owner است، نه Commander. از اینجا Owner می‌تواند نقش کاربران را
// تغییر دهد (فرمانده/رعیت/آزاد) و اقدامات مدیریتی سریع انجام دهد.
// =====================================================================

function buildKeyboard(targetId: number): InlineKeyboard {
  return [
    [
      { text: "🚫 بن", callback_data: `deed:ban:${targetId}` },
      { text: "🔇 سکوت", callback_data: `deed:mute:${targetId}` },
      { text: "⚠️ اخطار", callback_data: `deed:warn:${targetId}` },
    ],
    [
      { text: "⚔️ فرمانده", callback_data: `deed:role_commander:${targetId}` },
      { text: "⛓️ رعیت", callback_data: `deed:role_serf:${targetId}` },
      { text: "🔓 آزاد", callback_data: `deed:role_free:${targetId}` },
    ],
  ];
}

async function buildPanelText(env: Env, chatId: number, targetId: number, targetName: string): Promise<string> {
  const [role, balance, nickname, warningsResult] = await Promise.all([
    resolveRole(env, targetId, chatId),
    EconomyService.getBalance(env, targetId),
    NicknameDb.get(env, targetId, chatId),
    WarningDb.get(env, targetId, chatId, "GENERAL"),
  ]);

  return [
    Messages.deedLetter.title(targetName),
    Messages.deedLetter.line.role(roleLabel(role)),
    Messages.deedLetter.line.balance(balance ?? 0),
    Messages.deedLetter.line.nickname(nickname.ok ? nickname.data : null),
    Messages.deedLetter.line.warnings(warningsResult.ok ? warningsResult.data : 0, CONFIG.MAX_WARNINGS),
  ].join("\n");
}

export const DeedLetterFeature = {
  async open(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId || ctx.isPrivateChat) return;
    if (ctx.role !== Role.Owner) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.deedLetter.onlyOwner);
      return;
    }
    const target = ctx.message?.reply_to_message?.from;
    if (!target) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.deedLetter.needsReply);
      return;
    }

    const text = await buildPanelText(env, ctx.chatId, target.id, target.first_name);
    await TelegramApi.sendMessage(env, ctx.chatId, text, { keyboard: buildKeyboard(target.id) });
  },

  async handleCallback(env: Env, ctx: MessageContext): Promise<void> {
    const cq = ctx.callbackQuery;
    if (!cq || !cq.data || !ctx.chatId || !ctx.userId) return;
    const parts = cq.data.split(":");
    const namespace = parts[0];

    if (namespace === "spouse_more" || namespace === "spouse_clear") {
      const reply = await SpouseFeature.handleCallback(env, ctx, namespace, parts[1]);
      await TelegramApi.answerCallbackQuery(env, cq.id, reply);
      return;
    }

    if (namespace === "tax") {
      const reply = await TaxFeature.handleCallback(env, ctx, parts[1] as "confirm" | "cancel");
      await TelegramApi.answerCallbackQuery(env, cq.id, reply);
      return;
    }

    if (namespace !== "deed") return;

    // نامه اعمال (و همه اقدامات آن) فقط برای Owner است
    if (ctx.role !== Role.Owner) {
      await TelegramApi.answerCallbackQuery(env, cq.id, Messages.general.unauthorized, true);
      return;
    }

    const [, action, targetIdStr] = parts;
    const targetId = Number(targetIdStr);
    const targetName = cq.message?.reply_to_message?.from?.first_name ?? "کاربر";

    switch (action) {
      case "ban":
        await TelegramApi.banChatMember(env, ctx.chatId, targetId);
        await ActionLogDb.log(env, ctx.chatId, ctx.userId, targetId, "ban", "via_deed_letter");
        await TelegramApi.sendMessage(env, ctx.chatId, Messages.moderation.banned(targetName));
        break;
      case "mute":
        await TelegramApi.muteChatMember(env, ctx.chatId, targetId);
        await ActionLogDb.log(env, ctx.chatId, ctx.userId, targetId, "mute", "via_deed_letter");
        await TelegramApi.sendMessage(env, ctx.chatId, Messages.moderation.muted(targetName));
        break;
      case "warn": {
        const countResult = await WarningDb.increment(env, targetId, ctx.chatId, "GENERAL");
        const count = countResult.ok ? countResult.data : 0;
        await ActionLogDb.log(env, ctx.chatId, ctx.userId, targetId, "warn", String(count));
        if (count >= CONFIG.MAX_WARNINGS) {
          await TelegramApi.muteChatMember(env, ctx.chatId, targetId);
          await WarningDb.reset(env, targetId, ctx.chatId, "GENERAL");
        }
        break;
      }
      case "role_commander":
        await RoleDb.setCommander(env, targetId, ctx.chatId);
        await ActionLogDb.log(env, ctx.chatId, ctx.userId, targetId, "role_change", "commander");
        await TelegramApi.sendMessage(env, ctx.chatId, Messages.deedLetter.appointedCommander(targetName));
        break;
      case "role_serf":
        await RoleDb.setSerf(env, targetId, ctx.chatId);
        await ActionLogDb.log(env, ctx.chatId, ctx.userId, targetId, "role_change", "serf");
        await TelegramApi.sendMessage(env, ctx.chatId, Messages.deedLetter.revertedToSerf(targetName));
        break;
      case "role_free":
        await RoleDb.clearRole(env, targetId, ctx.chatId);
        await ActionLogDb.log(env, ctx.chatId, ctx.userId, targetId, "role_change", "free");
        await TelegramApi.sendMessage(env, ctx.chatId, Messages.deedLetter.freed(targetName));
        break;
      default:
        await TelegramApi.answerCallbackQuery(env, cq.id, Messages.general.unknownError);
        return;
    }

    await TelegramApi.answerCallbackQuery(env, cq.id, Messages.deedLetter.actionDone);
  },
};
