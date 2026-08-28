import type { Env, MessageContext } from "../../types";
import { PermissionKey } from "../../types";
import { NicknameDb } from "../../database/nicknames";
import { ActionLogDb } from "../../database/moderation";
import { TelegramApi } from "../../telegram/api";
import { Messages } from "../../telegram/messages";
import { requirePermission } from "../../telegram/router_helpers";

// دستورها طبق متن اصلی: «ثبت لقب <متن>» / «پاکسازی لقب» / «لیست القاب»
export const NicknameFeature = {
  async set(env: Env, ctx: MessageContext, nickname: string): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    const target = ctx.message?.reply_to_message?.from;
    if (!target) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.nickname.needsReply);
      return;
    }
    if (!nickname) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.nickname.needsText);
      return;
    }
    if (!(await requirePermission(env, ctx, PermissionKey.NICKNAME_SET, "ثبت لقب"))) return;

    await NicknameDb.set(env, target.id, ctx.chatId, nickname, ctx.userId);
    await ActionLogDb.log(env, ctx.chatId, ctx.userId, target.id, "nickname_set", nickname);
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.nickname.set(target.first_name, nickname));
  },

  async clear(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    const target = ctx.message?.reply_to_message?.from;
    if (!target) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.nickname.needsReply);
      return;
    }
    if (!(await requirePermission(env, ctx, PermissionKey.NICKNAME_CLEAR, "پاکسازی لقب"))) return;

    await NicknameDb.clear(env, target.id, ctx.chatId);
    await ActionLogDb.log(env, ctx.chatId, ctx.userId, target.id, "nickname_clear");
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.nickname.cleared(target.first_name));
  },

  async list(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    if (!(await requirePermission(env, ctx, PermissionKey.NICKNAME_LIST, "لیست القاب"))) return;

    const result = await NicknameDb.listForChat(env, ctx.chatId);
    if (!result.ok || result.data.length === 0) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.nickname.listEmpty);
      return;
    }
    const lines = result.data.map((r) => `• ${r.first_name}: ${r.nickname}`);
    await TelegramApi.sendMessage(env, ctx.chatId, `${Messages.nickname.listTitle}\n${lines.join("\n")}`);
  },
};
