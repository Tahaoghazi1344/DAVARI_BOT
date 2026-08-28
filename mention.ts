// =====================================================================
// ساخت Mention امن با HTML — همیشه از escape استفاده می‌شود تا نام
// کاربرانی که در نامشان کاراکترهای HTML خاص دارند (< > & ") باعث خرابی
// پیام یا تزریق نشوند.
// =====================================================================

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function mentionHtml(userId: number, name: string): string {
  return `<a href="tg://user?id=${userId}">${escapeHtml(name)}</a>`;
}
