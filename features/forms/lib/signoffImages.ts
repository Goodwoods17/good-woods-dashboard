import type { FormInstanceField } from "@shared/lib/types";

/**
 * Pre-resolve a form instance's photo + signature fields to renderable image
 * URLs, keyed by field id (Phase C consolidation — shared by the browser
 * `signoff.ts` and the server `signoffServer.ts` paths).
 *
 * react-pdf needs image `src` URLs synchronously at render time, so every
 * photo/signature field's stored path must be resolved to a renderable URL
 * (signed URL or inline `data:` URL) BEFORE the document is constructed. The two
 * call sites differ ONLY in how a path is resolved — the browser uses the public
 * `resolveFormPhotoUrl`, the server signs via the service-role client — so the
 * resolver is injected as a parameter.
 *
 * A missing/expired image must never abort the whole signoff: a resolver that
 * throws OR returns `null` simply drops that one field from the result.
 */
export async function preResolveImages(
  fields: FormInstanceField[],
  resolve: (path: string) => Promise<string | null>
): Promise<Record<string, string>> {
  const media = fields.filter(
    (f) =>
      (f.type === "photo" || f.type === "signature") && typeof f.photoUrl === "string" && f.photoUrl
  );
  const entries = await Promise.all(
    media.map(async (f) => {
      try {
        const url = await resolve(f.photoUrl as string);
        if (url === null) return null;
        return [f.id, url] as const;
      } catch {
        return null;
      }
    })
  );
  return Object.fromEntries(entries.filter((e): e is readonly [string, string] => e !== null));
}
