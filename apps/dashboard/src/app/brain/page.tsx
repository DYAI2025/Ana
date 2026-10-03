import { BrainView } from "@/features/brain/BrainView";

export default async function BrainPage({ searchParams }: { searchParams: Promise<{ node?: string | string[] }> }) {
  const { node } = await searchParams;
  const initial = typeof node === "string" ? node : undefined;
  return <BrainView key={initial ?? "none"} initialNode={initial} />;
}
