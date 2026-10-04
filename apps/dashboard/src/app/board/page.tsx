import { BoardView } from "@/features/board/BoardView";

type Search = Promise<{ ticket?: string | string[] }>;

export default async function BoardPage({ searchParams }: { searchParams: Search }) {
  const { ticket } = await searchParams;
  const highlight = typeof ticket === "string" ? ticket : undefined;
  // key: arriving from search starts with the "All" filter so the target ticket is visible
  return <BoardView key={highlight ?? "none"} highlight={highlight} />;
}
