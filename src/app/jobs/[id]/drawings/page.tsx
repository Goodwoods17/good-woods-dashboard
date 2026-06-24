import { DrawingsView } from "@features/drawings/components/DrawingsView";

export default function JobDrawingsPage({ params }: { params: { id: string } }) {
  return <DrawingsView jobId={params.id} />;
}
