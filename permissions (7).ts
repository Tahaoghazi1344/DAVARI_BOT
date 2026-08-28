import type { Env, PermissionKey } from "../types";
import { Role } from "../types";
import { RoleDb } from "../database/roles";
import { PermissionDb } from "../database/permissions";

// =====================================================================
// PermissionService — تنها نقطه‌ی مجاز برای تصمیم‌گیری «آیا این کاربر
// اجازه‌ی انجام این کار را دارد؟». هیچ Feature نباید مستقیماً از
// RoleDb/PermissionDb استفاده کند یا خودش منطق تشخیص نقش بنویسد.
//
// سلسله‌مراتب:
//   Owner      → به همه‌چیز دسترسی کامل دارد، همیشه.
//   Commander  → به‌طور پیش‌فرض به قابلیت‌های مدیریتی دسترسی دارد،
//                اما نمی‌تواند روی Owner اقدام کند.
//   Serf       → فقط اگر فرمانده/صاحب صریحاً یک Permission Key را برایش
//                فعال کرده باشد (جدول permissions).
//   Normal     → هیچ قابلیت مدیریتی‌ای ندارد.
// =====================================================================

/** تعیین نقش سیستمی کاربر در یک گروه مشخص */
export async function resolveRole(env: Env, userId: number, chatId: number): Promise<Role> {
  if (String(userId) === env.OWNER_ID) {
    return Role.Owner;
  }

  const roleResult = await RoleDb.getInGroup(env, userId, chatId);
  if (roleResult.ok && roleResult.data) {
    if (roleResult.data.is_commander === 1) return Role.Commander;
    if (roleResult.data.is_serf === 1) return Role.Serf;
  }

  return Role.Normal;
}

export const PermissionService = {
  resolveRole,

  /**
   * بررسی می‌کند آیا کاربر با نقش داده‌شده اجازه‌ی استفاده از یک
   * Permission Key مشخص را دارد یا نه.
   */
  async hasPermission(
    env: Env,
    userId: number,
    chatId: number,
    role: Role,
    key: PermissionKey
  ): Promise<boolean> {
    if (role === Role.Owner) return true;
    if (role === Role.Commander) return true; // فرمانده به‌طور پیش‌فرض دسترسی مدیریتی دارد
    if (role === Role.Serf) {
      const result = await PermissionDb.isEnabled(env, userId, chatId, key);
      return result.ok ? result.data : false;
    }
    return false; // Normal
  },

  /** آیا actor مجاز است روی target اقدام مدیریتی انجام دهد (مثلاً بن/تغییر نقش) */
  canActOn(actorRole: Role, targetRole: Role): boolean {
    if (actorRole === Role.Owner) return true;
    if (actorRole === Role.Commander) return targetRole !== Role.Owner;
    return false;
  },
};

/** برچسب فارسی یک نقش، برای نمایش در پیام‌ها و نامه اعمال */
export function roleLabel(role: Role): string {
  switch (role) {
    case Role.Owner:
      return "👑 صاحب ربات";
    case Role.Commander:
      return "⚔️ فرمانده";
    case Role.Serf:
      return "⛓️ رعیت";
    default:
      return "👤 کاربر عادی";
  }
}
