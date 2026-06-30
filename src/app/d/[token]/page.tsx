import { loadDocumentPortal } from "@features/documents/lib/documentShareServer";
import {
  loadDocumentRequestPortal,
  resolveCapabilityType,
} from "@features/documents/lib/documentRequestServer";
import { DocumentPortalView } from "@features/documents/components/DocumentPortalView";
import { DocumentRequestPortalView } from "@features/documents/components/DocumentRequestPortalView";
import { DocumentPortalInactive } from "@features/documents/components/DocumentPortalInactive";
import { projectFilesEnabled } from "@shared/lib/projectFilesFlag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// State behind a token is inherently live (revoke must take effect immediately,
// signed URLs are short-lived); never cache the public portal.
export const fetchCache = "force-no-store";

// The public, no-login document VIEW portal (S2, ADR 0022 · milestone #12).
// Thin: load the ONE job's CLIENT-SAFE curated document set behind the token
// server-side (service role, scoped by token, explicit column allow-list), then
// render it. A missing / revoked / expired token shows a clean inactive state,
// never data. Gated by NEXT_PUBLIC_PROJECT_FILES_ENABLED — when off the route
// renders the inactive state so prod stays dormant until the owner flips the flag.
// The /d/<token> namespace is shared across both document capability types — a
// no-login VIEW (document_view, S2) and a no-login UPLOAD (document_request, S11).
// Tokens are globally unique, so we resolve the row's capability_type first and
// dispatch; a foreign / unknown token resolves to null → clean inactive state.
export default async function DocumentPortalPage({ params }: { params: { token: string } }) {
  if (!projectFilesEnabled()) {
    return <DocumentPortalInactive reason="not_found" />;
  }

  const capabilityType = await resolveCapabilityType(params.token);

  if (capabilityType === "document_request") {
    const upload = await loadDocumentRequestPortal(params.token);
    if (!upload.ok) {
      return <DocumentPortalInactive reason={upload.reason} />;
    }
    return <DocumentRequestPortalView token={params.token} bundle={upload.bundle} />;
  }

  const result = await loadDocumentPortal(params.token);
  if (!result.ok) {
    return <DocumentPortalInactive reason={result.reason} />;
  }

  return <DocumentPortalView token={params.token} bundle={result.bundle} />;
}
