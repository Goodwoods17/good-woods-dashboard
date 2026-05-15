import { getLatestBriefing } from "@features/briefing/lib/generateBriefing";
import { BriefingFull } from "@features/briefing/components/BriefingFull";
import { RegenerateButton } from "@features/briefing/components/RegenerateButton";
import { PageHeader } from "@shared/components/layout/PageHeader";

export const dynamic = "force-dynamic";

export default async function BriefingPage() {
  const briefing = await getLatestBriefing();

  return (
    <>
      <PageHeader
        eyebrow="Daily"
        title="Briefing"
        subtitle={
          briefing
            ? `${briefing.items.length} item${
                briefing.items.length === 1 ? "" : "s"
              } need attention today`
            : "No briefings generated yet"
        }
        actions={<RegenerateButton />}
      />
      <div className="px-8 py-6">
        {briefing ? (
          <BriefingFull briefing={briefing} />
        ) : (
          <div className="bg-surface border border-border rounded-lg px-5 py-8 text-center text-sm text-text-secondary">
            No briefing yet. Click Regenerate to produce one now, or wait until
            tomorrow&apos;s 9am cron.
          </div>
        )}
      </div>
    </>
  );
}
