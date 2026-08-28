import type { Env, MessageContext } from "../../types";
import { PermissionKey, Role } from "../../types";
import { CONFIG } from "../../config";
import { WarningDb, ActionLogDb } from "../../database/moderation";
import { TelegramApi } from "../../telegram/api";
import { Messages } from "../../telegram/messages";
import { requirePermission } from "../../telegram/router_helpers";
import { PermissionService, resolveRole } from "../../telegram/permissions";

// دستورها طبق متن اصلی: «بن» / «رفع بن» / «سکوت» / «رفع سکوت» / «اخطار»
// فرمانده و Owner مصون از این اقدامات‌اند (canActOn این را تضمین می‌کند).

async function resolveTargetOrReject(
  env: Env,
  ctx: MessageContext
): Promise<{ id: number; name: string; role: Role } | null> {
  if (!ctx.chatId) return null;
  const target = ctx.message?.reply_to_message?.from;
  if (!target) {
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.moderation.needsReply);
    return null;
  }
  const targetRole = await resolveRole(env, target.id, ctx.chatId);
  if (!PermissionService.canActOn(ctx.role, targetRole)) {
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.moderation.cannotActOnOwner);
    return null;
  }
  return { id: target.id, name: target.first_name, role: targetRole };
}

export const ModerationFeature = {
  async ban(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    if (!(await requirePermission(env, ctx, PermissionKey.MOD_BAN, "بن"))) return;
    const target = await resolveTargetOrReject(env, ctx);
    if (!target) return;

    await TelegramApi.banChatMember(env, ctx.chatId, target.id);
    await ActionLogDb.log(env, ctx.chatId, ctx.userId, target.id, "ban");
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.moderation.banned(target.name));
  },

  async unban(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    if (!(await requirePermission(env, ctx, PermissionKey.MOD_UNBAN, "رفع بن"))) return;
    const target = await resolveTargetOrReject(env, ctx);
    if (!target) return;

    await TelegramApi.unbanChatMember(env, ctx.chatId, target.id);
    await ActionLogDb.log(env, ctx.chatId, ctx.userId, target.id, "unban");
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.moderation.unbanned(target.name));
  },

  async mute(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    if (!(await requirePermission(env, ctx, PermissionKey.MOD_MUTE, "سکوت"))) return;
    const target = await resolveTargetOrReject(env, ctx);
    if (!target) return;

    await TelegramApi.muteChatMember(env, ctx.chatId, target.id);
    await ActionLogDb.log(env, ctx.chatId, ctx.userId, target.id, "mute");
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.moderation.muted(target.name));
  },

  async unmute(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    if (!(await requirePermission(env, ctx, PermissionKey.MOD_UNMUTE, "رفع سکوت"))) return;
    const target = await resolveTargetOrReject(env, ctx);
    if (!target) return;

    await TelegramApi.unmuteChatMember(env, ctx.chatId, target.id);
    await ActionLogDb.log(env, ctx.chatId, ctx.userId, target.id, "unmute");
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.moderation.unmuted(target.name));
  },

  async warn(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    if (!(await requirePermission(env, ctx, PermissionKey.MOD_MUTE, "اخطار"))) return;
    const target = await resolveTargetOrReject(env, ctx);
    if (!target) return;

    const countResult = await WarningDb.increment(env, target.id, ctx.chatId, "GENERAL");
    const count = countResult.ok ? countResult.data : 0;
    await ActionLogDb.log(env, ctx.chatId, ctx.userId, target.id, "warn", String(count));
    await TelegramApi.sendMessage(
      env,
      ctx.chatId,
      Messages.moderation.warned(target.name, count, CONFIG.MAX_WARNINGS)
    );

    if (count >= CONFIG.MAX_WARNINGS) {
      await TelegramApi.muteChatMember(env, ctx.chatId, target.id);
      await WarningDb.reset(env, target.id, ctx.chatId, "GENERAL");
      await ActionLogDb.log(env, ctx.chatId, ctx.userId, target.id, "auto_mute");
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.moderation.autoMutedAfterWarnings(target.name));
    }
  },
};
