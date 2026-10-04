import { BrainView } from "@/features/brain/BrainView";

export default async function BrainPage({ searchParams }: { searchParams: Promise<{ node?: string | string[]; nav?: string | string[] }> }) {
  const { node, nav } = await searchParams;
  const initial = typeof node === "string" ? node : undefined;
  return <BrainView key={`${initial ?? "none"}-${String(nav)}`} initialNode={initial} />;
}
