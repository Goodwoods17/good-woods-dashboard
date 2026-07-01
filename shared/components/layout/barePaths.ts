// No-login capability-link portals render CHROMELESS — an anonymous share-link
// recipient must never see the internal app shell (sidebar nav to Pipeline,
// Invoices, P&L, CRM…). Every token-portal route prefix belongs here:
//   /f/ form-fill (Forms P2) · /d/ document view + upload (Project Files) ·
//   /s/ client schedule (Scheduling P6). Plus /login. Miss one and the root
//   layout wraps that portal in <AppShell> chrome — an IA leak to clients.
export const BARE_PATHS = ["/login", "/f/", "/d/", "/s/"] as const;

/** True when `pathname` is a chromeless route (login or a no-login portal). */
export function isBarePath(pathname: string | null | undefined): boolean {
  return BARE_PATHS.some((p) => (pathname ?? "").startsWith(p));
}
