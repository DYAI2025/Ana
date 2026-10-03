import { BoardView } from "@/features/board/BoardView";

type Search = Promise<{ ticket?: string | string[] }>;

export default async function BoardPage({ searchParams }: { searchParams: Search }) {
  const { ticket } = await searchParams;
  return <BoardView highlight={typeof ticket === "string" ? ticket : undefined} />;
}
