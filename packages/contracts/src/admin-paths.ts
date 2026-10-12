/** Admin redirects retain the deployed prefix and reject paths outside the admin. */
export function safeAdminReturn(target: string): string {
  let path = target;
  if (/^https?:\/\//i.test(path)) {
    try { const u = new URL(path); path = u.pathname + u.search; }
    catch { return "/yihot/admin"; }
  }
  if (/^\/admin(?:\/|\?|$)/.test(path)) path = `/yihot${path}`;
  return /^\/yihot\/admin(?:\/|\?|$)/.test(path) && !/[\\\r\n]/.test(path) ? path : "/yihot/admin";
}
