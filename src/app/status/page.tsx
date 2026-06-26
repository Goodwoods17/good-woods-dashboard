import { notFound } from "next/navigation";
import { StatusBoardView } from "@features/job-status/components/StatusBoardView";
import { jobStatusEnabled } from "@features/job-status/lib/featureFlag";

export default function StatusPage() {
  if (!jobStatusEnabled()) notFound();
  return <StatusBoardView />;
}
