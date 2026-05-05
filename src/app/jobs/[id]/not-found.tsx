import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";

export default function NotFound() {
  return (
    <>
      <PageHeader eyebrow="Jobs" title="Job not found" />
      <div className="px-8 py-10">
        <div className="bg-surface border border-border border-dashed rounded-lg p-10 text-center max-w-xl">
          <p className="text-sm text-text-secondary mb-4">
            That job ID doesn&apos;t exist in the M1 seed set.
          </p>
          <Link
            href="/"
            className="inline-flex items-center text-sm font-medium text-accent hover:text-accent-hover transition-colors duration-fast"
          >
            ← Back to Jobs
          </Link>
        </div>
      </div>
    </>
  );
}
