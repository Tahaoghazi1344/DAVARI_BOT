import type { Env, MessageContext } from "../../types";
import { PermissionKey } from "../../types";
import { ActionLogDb } from "../../database/moderation";
import { EconomyService } from "../../economy/economy";
import { TelegramApi } from "../../telegram/api";
import { Messages } from "../../telegram/messages";
import { requirePermission } from "../../telegram/router_helpers";

// طبق متن اصلی، انعام با ریپلای + یکی از دو الگو نوشته می‌شود:
//   «500+»   یا   «500 سکه به تو انعام می‌دهم»
// تشخیص الگو در Router انجام می‌شود؛ این فایل فقط مبلغ نهایی را می‌گیرد.
export const TipFeature = {
  async give(env: Env, ctx: MessageContext, amount: number): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    const target = ctx.message?.reply_to_message?.from;
    if (!target) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.tip.needsReply);
      return;
    }
    if (!(await requirePermission(env, ctx, PermissionKey.TIP_USE, "انعام"))) return;

    if (!Number.isFinite(amount) || amount <= 0) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.tip.invalidAmount);
      return;
    }

    const result = await EconomyService.adjustBalance(env, target.id, amount, "tip", {
      chatId: ctx.chatId,
      reference: `from:${ctx.userId}`,
    });
    if (!result.ok) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.general.unknownError);
      return;
    }

    await ActionLogDb.log(env, ctx.chatId, ctx.userId, target.id, "tip", String(amount));
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.tip.given(target.first_name, amount));
  },
};
