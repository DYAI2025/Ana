import { ToolboxView } from "@/features/connections/ToolboxView";

export default async function ToolboxPage({ searchParams }: { searchParams: Promise<{ tool?: string | string[]; nav?: string | string[] }> }) {
  const { tool, nav } = await searchParams;
  const highlight = typeof tool === "string" ? tool : undefined;
  return <ToolboxView key={`${highlight ?? "none"}-${String(nav)}`} highlight={highlight} />;
}
