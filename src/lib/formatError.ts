/**
 * Stringify any thrown value into something readable.
 * Supabase errors aren't `Error` instances — they're plain objects with
 * `message`, `details`, `hint`, `code`. Without this helper they show up as
 * "[object Object]" and we lose all debug info.
 */
export function formatError(e: unknown): string {
  if (!e) return "Unknown error";
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (typeof e === "object") {
    const obj = e as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof obj.message === "string") parts.push(obj.message);
    if (typeof obj.details === "string") parts.push(`details: ${obj.details}`);
    if (typeof obj.hint === "string") parts.push(`hint: ${obj.hint}`);
    if (typeof obj.code === "string") parts.push(`(code ${obj.code})`);
    if (parts.length > 0) return parts.join(" — ");
    try {
      return JSON.stringify(obj);
    } catch {
      return String(obj);
    }
  }
  return String(e);
}
