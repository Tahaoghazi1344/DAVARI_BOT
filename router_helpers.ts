import type { Env, MessageContext, PermissionKey } from "../types";
import { PermissionService } from "./permissions";
import { TelegramApi } from "./api";
import { Messages } from "./messages";

// =====================================================================
// این فایل عمداً از router.ts جدا شده: چون هندلرهای هر Feature (در
// src/features/...) به requirePermission نیاز دارند و خود router.ts هم
// آن Featureها را import می‌کند، قرار دادن این تابع داخل router.ts باعث
// Circular Import می‌شد.
// =====================================================================

/** بررسی سریع مجوز + ارسال پیام رد در صورت نبود دسترسی */
export async function requirePermission(
  env: Env,
  ctx: MessageContext,
  key: PermissionKey,
  featureNameFa: string
): Promise<boolean> {
  if (!ctx.userId || !ctx.chatId) return false;
  const allowed = await PermissionService.hasPermission(env, ctx.userId, ctx.chatId, ctx.role, key);
  if (!allowed) {
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.permission.denied(featureNameFa));
  }
  return allowed;
}
