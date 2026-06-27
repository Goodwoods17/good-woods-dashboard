import { notFound } from "next/navigation";
import { StatusBoard } from "@features/job-status/components/StatusBoard";
import { jobStatusEnabled } from "@features/job-status/lib/featureFlag";

export default function StatusPage() {
  if (!jobStatusEnabled()) notFound();
  return <StatusBoard />;
}
