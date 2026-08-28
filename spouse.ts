import type { Env, MessageContext, TelegramMessage } from "../../types";
import { PermissionKey } from "../../types";
import { SpouseDb } from "../../database/spouses";
import type { ResponseKind } from "../../database/words";
import { SessionDb } from "../../database/sessions";
import { TelegramApi } from "../../telegram/api";
import { Messages } from "../../telegram/messages";
import { requirePermission } from "../../telegram/router_helpers";
import { confirmCancelKeyboard } from "../../telegram/keyboards";

// =====================================================================
// قابلیت «همسر» ❤️ — طبق متن اصلی، یک مجموعه شخصی از محتوا است که هر
// کاربر برای خودش در هر گروه می‌سازد (نه ازدواج دوطرفه بین دو کاربر).
// جریان ثبت (Session چندمرحله‌ای، تکرارشونده):
//   ۱) «ثبت همسر من» → Session step='item'
//   ۲) هر پیام کاربر به‌عنوان یک آیتم ذخیره می‌شود → step='ask_more'
//   ۳) با دکمه «بله»/«خیر» یا ادامه دادن، حلقه ادامه یا پایان می‌یابد
// =====================================================================

const SESSION_TYPE = "spouse_register";
const CLEAR_SESSION_TYPE = "spouse_clear_confirm";

function detectItemKind(message: TelegramMessage): { kind: ResponseKind; fileId?: string; text?: string } | null {
  if (message.text) return { kind: "text", text: message.text };
  if (message.photo && message.photo.length > 0) {
    return { kind: "photo", fileId: message.photo[message.photo.length - 1].file_id };
  }
  if (message.animation) return { kind: "animation", fileId: message.animation.file_id };
  if (message.sticker) return { kind: "sticker", fileId: message.sticker.file_id };
  if (message.video) return { kind: "video", fileId: message.video.file_id };
  if (message.voice) return { kind: "voice", fileId: message.voice.file_id };
  if (message.audio) return { kind: "audio", fileId: message.audio.file_id };
  if (message.document) return { kind: "document", fileId: message.document.file_id };
  return null;
}

export const SpouseFeature = {
  isOwnSession(ctx: MessageContext): boolean {
    return (
      ctx.activeSession?.session_type === SESSION_TYPE ||
      ctx.activeSession?.session_type === CLEAR_SESSION_TYPE
    );
  },

  /** شروع ثبت — «ثبت همسر من» (برای خود کاربر) */
  async startRegisterSelf(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    if (!(await requirePermission(env, ctx, PermissionKey.SPOUSE_USE, "همسر"))) return;

    await SessionDb.start(env, ctx.userId, ctx.chatId, SESSION_TYPE, "item", { targetId: ctx.userId });
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.spouse.startRegister);
  },

  /** شروع ثبت توسط Owner برای شخص دیگر (با ریپلای) */
  async startRegisterForTarget(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    const target = ctx.message?.reply_to_message?.from;
    if (!target) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.spouse.needsReply);
      return;
    }
    if (!(await requirePermission(env, ctx, PermissionKey.SPOUSE_ADMIN, "مدیریت همسر"))) return;

    await SessionDb.start(env, ctx.userId, ctx.chatId, SESSION_TYPE, "item", { targetId: target.id });
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.spouse.startRegister);
  },

  async show(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    const target = ctx.message?.reply_to_message?.from ?? ctx.message?.from;
    if (!target) return;

    const item = await SpouseDb.getRandomItem(env, target.id, ctx.chatId);
    if (!item.ok || !item.data) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.spouse.noSpouse(target.first_name));
      return;
    }
    await TelegramApi.sendStoredResponse(env, ctx.chatId, item.data.kind, {
      text: item.data.text_content ?? undefined,
      fileId: item.data.file_id ?? undefined,
    });
  },

  async startClear(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    if (!(await requirePermission(env, ctx, PermissionKey.SPOUSE_CLEAR, "پاکسازی همسر"))) return;

    await SessionDb.start(env, ctx.userId, ctx.chatId, CLEAR_SESSION_TYPE, "confirm");
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.spouse.askClearConfirm, {
      keyboard: confirmCancelKeyboard("spouse_clear:yes", "spouse_clear:no"),
    });
  },

  async continueSession(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId || !ctx.message || !ctx.activeSession) return;
    const session = ctx.activeSession;

    if (session.session_type === SESSION_TYPE) {
      const targetId = (session.data as { targetId?: number }).targetId ?? ctx.userId;
      const detected = detectItemKind(ctx.message);
      if (!detected) {
        await TelegramApi.sendMessage(env, ctx.chatId, Messages.spouse.invalidItemType);
        return;
      }
      await SpouseDb.addItem(env, targetId, ctx.chatId, detected.kind, detected.text, detected.fileId);
      await SessionDb.updateStep(env, ctx.userId, ctx.chatId, "item", { targetId });
      await TelegramApi.sendMessage(env, ctx.chatId, `${Messages.spouse.saved}\n\n${Messages.spouse.askMore}`, {
        keyboard: confirmCancelKeyboard("spouse_more:yes", "spouse_more:no", "➕ بله", "✅ تمام شد"),
      });
    }
    // CLEAR_SESSION_TYPE فقط از طریق Callback ادامه پیدا می‌کند (handleClearCallback)
  },

  /** پردازش دکمه‌های «آیتم دیگری هست؟» و «پاکسازی همسر» */
  async handleCallback(env: Env, ctx: MessageContext, namespace: string, action: string): Promise<string> {
    if (!ctx.chatId || !ctx.userId) return "خطا";

    if (namespace === "spouse_more") {
      if (action === "no") {
        const countResult = await SpouseDb.count(env, ctx.userId, ctx.chatId);
        await SessionDb.clear(env, ctx.userId, ctx.chatId);
        await TelegramApi.sendMessage(
          env,
          ctx.chatId,
          Messages.spouse.finished(countResult.ok ? countResult.data : 0)
        );
        return "تمام شد.";
      }
      // action === "yes" → منتظر آیتم بعدی می‌مانیم (Session همچنان فعال است)
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.spouse.startRegister);
      return "بفرست.";
    }

    if (namespace === "spouse_clear") {
      await SessionDb.clear(env, ctx.userId, ctx.chatId);
      if (action === "yes") {
        await SpouseDb.clearAll(env, ctx.userId, ctx.chatId);
        await TelegramApi.sendMessage(env, ctx.chatId, Messages.spouse.cleared);
        return "پاک شد.";
      }
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.spouse.cancelled);
      return "لغو شد.";
    }

    return "نامشخص";
  },
};
