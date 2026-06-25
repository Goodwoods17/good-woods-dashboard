import { loadShareLink } from "@features/forms/lib/shareLinkServer";
import { PublicFillView } from "@features/forms/components/PublicFillView";
import { ShareLinkInactive } from "@features/forms/components/ShareLinkInactive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The public, no-login token-fill page. Thin: load the one instance behind the
// token server-side (service role, scoped by token), then render the client
// fill view. A missing / revoked token shows a clean inactive state, never data.
export default async function PublicFormPage({ params }: { params: { token: string } }) {
  const result = await loadShareLink(params.token);

  if (!result.ok) {
    return <ShareLinkInactive reason={result.reason} />;
  }

  const { link, instance, fields } = result.bundle;
  return (
    <PublicFillView
      token={params.token}
      instance={instance}
      fields={fields}
      lockedFieldIds={link.lockedFieldIds}
      recipientName={link.recipientName}
      alreadySubmitted={link.submittedAt !== null}
    />
  );
}
