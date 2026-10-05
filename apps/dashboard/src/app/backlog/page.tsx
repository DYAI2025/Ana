import { BacklogView } from "@/features/board/BacklogView";

type Search = Promise<{ ticket?: string | string[]; nav?: string | string[] }>;

export default async function BacklogPage({ searchParams }: { searchParams: Search }) {
  const { ticket, nav } = await searchParams;
  const highlight = typeof ticket === "string" ? ticket : undefined;
  return <BacklogView key={`${highlight ?? "none"}-${String(nav)}`} highlight={highlight} />;
}
