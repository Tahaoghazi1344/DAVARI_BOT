import type { Env, InlineKeyboard } from "../types";

// =====================================================================
// لایه‌ی خام ارتباط با Telegram Bot API.
// هیچ منطق تجاری اینجا نباید باشد — فقط فراخوانی متدهای Telegram.
// توکن هرگز Log یا در پیام خطا نمایش داده نمی‌شود.
// =====================================================================

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

/** فراخوانی عمومی و امن هر متد Telegram Bot API */
async function callTelegramApi<T = unknown>(
  env: Env,
  method: string,
  payload: Record<string, unknown>
): Promise<TelegramApiResponse<T>> {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as TelegramApiResponse<T>;

    if (!data.ok) {
      // توکن هرگز اینجا لاگ نمی‌شود؛ فقط پیام خطای برگشتی از تلگرام
      console.error(`Telegram API error [${method}]:`, data.description);
    }

    return data;
  } catch (err) {
    console.error(`Telegram API network failure [${method}]:`, err);
    return { ok: false, description: "network_error" };
  }
}

function toReplyMarkup(keyboard?: InlineKeyboard) {
  if (!keyboard) return undefined;
  return { inline_keyboard: keyboard };
}

export const TelegramApi = {
  /** ارسال پیام متنی */
  async sendMessage(
    env: Env,
    chatId: number,
    text: string,
    options?: { keyboard?: InlineKeyboard; replyToMessageId?: number }
  ) {
    return callTelegramApi(env, "sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: toReplyMarkup(options?.keyboard),
      reply_to_message_id: options?.replyToMessageId,
      allow_sending_without_reply: true,
    });
  },

  /** ویرایش متن یک پیام موجود (مثلاً برای پنل‌های Inline) */
  async editMessageText(
    env: Env,
    chatId: number,
    messageId: number,
    text: string,
    keyboard?: InlineKeyboard
  ) {
    return callTelegramApi(env, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      reply_markup: toReplyMarkup(keyboard),
    });
  },

  /** حذف یک پیام (مثلاً بستن پنل نامه اعمال پس از ثبت) */
  async deleteMessage(env: Env, chatId: number, messageId: number) {
    return callTelegramApi(env, "deleteMessage", {
      chat_id: chatId,
      message_id: messageId,
    });
  },

  /** پاسخ به Callback Query (برای جلوگیری از حالت Loading دکمه در تلگرام) */
  async answerCallbackQuery(
    env: Env,
    callbackQueryId: string,
    text?: string,
    showAlert = false
  ) {
    return callTelegramApi(env, "answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  },

  /** کپی هر نوع پیام (متن/عکس/GIF/استیکر/ویدیو/...) با استفاده از file_id — برای پاسخ‌های سفارشی و همسر */
  async copyMessage(
    env: Env,
    toChatId: number,
    fromChatId: number,
    messageId: number
  ) {
    return callTelegramApi(env, "copyMessage", {
      chat_id: toChatId,
      from_chat_id: fromChatId,
      message_id: messageId,
    });
  },

  /** دریافت اطلاعات عضویت یک کاربر در گروه (برای بررسی ادمین بودن ربات و ...) */
  async getChatMember(env: Env, chatId: number, userId: number) {
    return callTelegramApi(env, "getChatMember", {
      chat_id: chatId,
      user_id: userId,
    });
  },

  /** بن کردن کاربر از گروه (ربات باید ادمین با دسترسی Restrict باشد) */
  async banChatMember(env: Env, chatId: number, userId: number) {
    return callTelegramApi(env, "banChatMember", {
      chat_id: chatId,
      user_id: userId,
    });
  },

  /** رفع بن (با unbanChatMember + only_if_banned تا کاربر عادی Kick نشود) */
  async unbanChatMember(env: Env, chatId: number, userId: number) {
    return callTelegramApi(env, "unbanChatMember", {
      chat_id: chatId,
      user_id: userId,
      only_if_banned: true,
    });
  },

  /** میوت کردن کاربر (محدودیت ارسال پیام) — durationSeconds اختیاری، پیش‌فرض نامحدود */
  async muteChatMember(env: Env, chatId: number, userId: number, durationSeconds?: number) {
    const untilDate = durationSeconds
      ? Math.floor(Date.now() / 1000) + durationSeconds
      : undefined;
    return callTelegramApi(env, "restrictChatMember", {
      chat_id: chatId,
      user_id: userId,
      until_date: untilDate,
      permissions: {
        can_send_messages: false,
        can_send_audios: false,
        can_send_documents: false,
        can_send_photos: false,
        can_send_videos: false,
        can_send_video_notes: false,
        can_send_voice_notes: false,
        can_send_polls: false,
        can_send_other_messages: false,
        can_add_web_page_previews: false,
      },
    });
  },

  /** رفع میوت (بازگرداندن مجوزهای پایه ارسال پیام) */
  async unmuteChatMember(env: Env, chatId: number, userId: number) {
    return callTelegramApi(env, "restrictChatMember", {
      chat_id: chatId,
      user_id: userId,
      permissions: {
        can_send_messages: true,
        can_send_audios: true,
        can_send_documents: true,
        can_send_photos: true,
        can_send_videos: true,
        can_send_video_notes: true,
        can_send_voice_notes: true,
        can_send_polls: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
      },
    });
  },

  /**
   * ارسال یک پاسخ سفارشی ذخیره‌شده (متن یا مدیا با file_id).
   * برای مدیا از همان file_id ذخیره‌شده در دیتابیس استفاده می‌شود که
   * توسط همین ربات معتبر است (نیازی به کپی از چت مبدا نیست).
   */
  async sendStoredResponse(
    env: Env,
    chatId: number,
    kind: "text" | "photo" | "video" | "animation" | "sticker" | "voice" | "audio" | "document",
    payload: { text?: string; fileId?: string }
  ) {
    if (kind === "text") {
      return this.sendMessage(env, chatId, payload.text ?? "");
    }

    const methodByKind: Record<"photo" | "video" | "animation" | "sticker" | "voice" | "audio" | "document", string> = {
      photo: "sendPhoto",
      video: "sendVideo",
      animation: "sendAnimation",
      sticker: "sendSticker",
      voice: "sendVoice",
      audio: "sendAudio",
      document: "sendDocument",
    };

    const fieldByKind: Record<"photo" | "video" | "animation" | "sticker" | "voice" | "audio" | "document", string> = {
      photo: "photo",
      video: "video",
      animation: "animation",
      sticker: "sticker",
      voice: "voice",
      audio: "audio",
      document: "document",
    };

    return callTelegramApi(env, methodByKind[kind], {
      chat_id: chatId,
      [fieldByKind[kind]]: payload.fileId,
    });
  },
};
