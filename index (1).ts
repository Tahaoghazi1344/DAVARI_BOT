import type { Env, TelegramUpdate } from "./types";
import { handleUpdate } from "./telegram/router";

// =====================================================================
// نقطه ورود Worker.
// امنیت Webhook: هدر X-Telegram-Bot-Api-Secret-Token باید دقیقاً برابر
// BOT_SECRET باشد. این هدر هنگام ثبت Webhook با setWebhook (پارامتر
// secret_token) تنظیم می‌شود.
//
// Idempotency: تلگرام ممکن است یک Update را بیش از یک‌بار ارسال کند
// (مثلاً به‌دلیل Timeout در پاسخ). با ذخیره‌ی update_id در KV به مدت
// ۲۴ ساعت، از پردازش تکراری (و مثلاً کسر دوباره‌ی مالیات) جلوگیری
// می‌شود.
// =====================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (!env.BOT_SECRET || secretHeader !== env.BOT_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    let update: TelegramUpdate;
    try {
      update = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    try {
      const idempotencyKey = `update:${update.update_id}`;
      const seen = await env.BOT_KV.get(idempotencyKey);
      if (seen) {
        return new Response("OK", { status: 200 }); // قبلاً پردازش شده — نادیده گرفته می‌شود
      }
      await env.BOT_KV.put(idempotencyKey, "1", { expirationTtl: 60 * 60 * 24 });

      await handleUpdate(env, update);
    } catch (err) {
      // هرگز نباید بگذاریم یک خطای پیش‌بینی‌نشده باعث Retry بی‌پایان
      // تلگرام یا Crash کل Worker شود.
      console.error("[Unhandled error in handleUpdate]:", err);
    }

    return new Response("OK", { status: 200 });
  },
};
