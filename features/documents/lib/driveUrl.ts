/**
 * Google Drive URL parsing + embed helpers. Drive-first matches Andrew's
 * existing ecosystem; we store URLs in Supabase and render previews via
 * Drive's iframe embed.
 *
 * Accepts these Drive share URL shapes:
 *   - https://drive.google.com/file/d/<ID>/view?usp=sharing
 *   - https://drive.google.com/open?id=<ID>
 *   - https://docs.google.com/document/d/<ID>/edit
 *   - https://docs.google.com/spreadsheets/d/<ID>/edit
 *   - https://docs.google.com/presentation/d/<ID>/edit
 *   - https://drive.google.com/drive/folders/<ID>  (folder; preview not supported)
 */

export type DriveResource = {
  fileId: string | null;
  kind: "file" | "document" | "spreadsheet" | "presentation" | "folder" | "unknown";
  /** URL suitable for a <iframe src=...> preview. Null for folders. */
  embedUrl: string | null;
  /** Original URL, normalised. */
  viewUrl: string;
};

export function parseDriveUrl(raw: string): DriveResource | null {
  if (!raw) return null;
  let trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  // Strip surrounding angle brackets some email clients add.
  trimmed = trimmed.replace(/^<|>$/g, "");

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (!host.endsWith("google.com")) return null;

  // /file/d/<ID>/view
  const fileMatch = url.pathname.match(/^\/file\/d\/([^/]+)/);
  if (fileMatch) {
    const id = fileMatch[1];
    return {
      fileId: id,
      kind: "file",
      embedUrl: `https://drive.google.com/file/d/${id}/preview`,
      viewUrl: trimmed,
    };
  }

  // /open?id=<ID>
  if (url.pathname === "/open") {
    const id = url.searchParams.get("id");
    if (id) {
      return {
        fileId: id,
        kind: "file",
        embedUrl: `https://drive.google.com/file/d/${id}/preview`,
        viewUrl: trimmed,
      };
    }
  }

  // /document/d/<ID>, /spreadsheets/d/<ID>, /presentation/d/<ID>
  const docMatch = url.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([^/]+)/);
  if (docMatch) {
    const kindRaw = docMatch[1];
    const id = docMatch[2];
    const kind =
      kindRaw === "document"
        ? "document"
        : kindRaw === "spreadsheets"
          ? "spreadsheet"
          : "presentation";
    return {
      fileId: id,
      kind,
      embedUrl: `https://docs.google.com/${kindRaw}/d/${id}/preview`,
      viewUrl: trimmed,
    };
  }

  // /drive/folders/<ID>
  const folderMatch = url.pathname.match(/^\/drive\/folders\/([^/]+)/);
  if (folderMatch) {
    return {
      fileId: folderMatch[1],
      kind: "folder",
      embedUrl: null,
      viewUrl: trimmed,
    };
  }

  return { fileId: null, kind: "unknown", embedUrl: null, viewUrl: trimmed };
}

/**
 * Best-effort label guess from a Drive URL. The user typically pastes
 * a URL with no filename context, so we fall back to "Drawing" with
 * the kind hint. They can always edit the label after creation.
 */
export function guessLabelFromUrl(url: string, fallback = "Drawing"): string {
  const parsed = parseDriveUrl(url);
  if (!parsed) return fallback;
  switch (parsed.kind) {
    case "spreadsheet":
      return "Spreadsheet";
    case "document":
      return "Document";
    case "presentation":
      return "Presentation";
    case "folder":
      return "Folder";
    default:
      return fallback;
  }
}
