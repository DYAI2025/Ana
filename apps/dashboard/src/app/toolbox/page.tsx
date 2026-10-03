import { ToolboxView } from "@/features/connections/ToolboxView";

export default async function ToolboxPage({ searchParams }: { searchParams: Promise<{ tool?: string | string[] }> }) {
  const { tool } = await searchParams;
  const highlight = typeof tool === "string" ? tool : undefined;
  return <ToolboxView key={highlight ?? "none"} highlight={highlight} />;
}
