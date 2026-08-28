import type { InlineKeyboard } from "../types";

// =====================================================================
// توابع کمکی برای ساخت کیبوردهای Inline.
// کیبوردهای اختصاصی هر قابلیت (مثلاً پنل نامه اعمال) در پارت‌های بعدی
// در همین پوشه، در فایل‌های جداگانه اضافه می‌شوند.
// =====================================================================

/** یک دکمه تک‌ردیفی ساده (تایید/لغو و مواردی از این دست) */
export function confirmCancelKeyboard(
  confirmData: string,
  cancelData: string,
  confirmText = "✅ بله",
  cancelText = "❌ خیر"
): InlineKeyboard {
  return [
    [
      { text: confirmText, callback_data: confirmData },
      { text: cancelText, callback_data: cancelData },
    ],
  ];
}

/** تبدیل یک آرایه‌ی مسطح از دکمه‌ها به کیبورد چندستونه */
export function chunkButtons(
  buttons: { text: string; callback_data: string }[],
  perRow: number
): InlineKeyboard {
  const rows: InlineKeyboard = [];
  for (let i = 0; i < buttons.length; i += perRow) {
    rows.push(buttons.slice(i, i + perRow));
  }
  return rows;
}
