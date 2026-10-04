import { BoardView } from "@/features/board/BoardView";

type Search = Promise<{ ticket?: string | string[]; nav?: string | string[] }>;

export default async function BoardPage({ searchParams }: { searchParams: Search }) {
  const { ticket, nav } = await searchParams;
  const highlight = typeof ticket === "string" ? ticket : undefined;
  // key: every arrival from search (nav nonce) starts with the "All" filter so the target ticket is visible
  return <BoardView key={`${highlight ?? "none"}-${String(nav)}`} highlight={highlight} />;
}
