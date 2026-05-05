import { notFound } from "next/navigation";
import { JobDetail } from "@/components/jobs/JobDetail";
import { SEED_JOBS, getJob } from "@/lib/jobs";

export function generateStaticParams() {
  return SEED_JOBS.map((job) => ({ id: job.id }));
}

export default function JobPage({ params }: { params: { id: string } }) {
  const job = getJob(params.id);
  if (!job) notFound();
  return <JobDetail initialJob={job} />;
}
