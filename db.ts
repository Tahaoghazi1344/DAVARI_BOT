// =====================================================================
// اجرای امن عملیات دیتابیس.
// طبق قانون پروژه: اگر D1 موقتاً در دسترس نباشد، نباید Exception خام
// بالا بیاید یا اطلاعات ناقص ثبت شود؛ باید null/false برگردد تا لایه‌ی
// بالاتر پیام «سیستم قادر به پردازش نیست» را نمایش دهد.
// =====================================================================

/** نتیجه‌ی یک عملیات دیتابیس که ممکن است شکست بخورد */
export type DbResult<T> = { ok: true; data: T } | { ok: false };

export async function safeDbRun<T>(
  operation: () => Promise<T>,
  context: string
): Promise<DbResult<T>> {
  try {
    const data = await operation();
    return { ok: true, data };
  } catch (err) {
    console.error(`[DB ERROR] ${context}:`, err);
    return { ok: false };
  }
}

/** تولید Timestamp استاندارد ISO برای ذخیره در D1 */
export function nowIso(): string {
  return new Date().toISOString();
}
