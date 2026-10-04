/**
 * The controlled set of top-level modules (Confluence 07 REQ-F-004: modules are not user-created).
 * Backlog is a sub-view of Board and is reached from Board, the Work lens and search.
 */
export const PRIMARY_VIEWS = ["now", "board", "sessions", "brain", "whiteboard", "calendar", "pulse", "vault", "toolbox"] as const;
export type PrimaryViewId = (typeof PRIMARY_VIEWS)[number];
export type ViewId = PrimaryViewId | "backlog";

export const VIEW_HREF: Readonly<Record<ViewId, string>> = {
  now: "/",
  board: "/board",
  backlog: "/backlog",
  sessions: "/sessions",
  brain: "/brain",
  whiteboard: "/whiteboard",
  calendar: "/calendar",
  pulse: "/pulse",
  vault: "/vault",
  toolbox: "/toolbox",
};

/** Which rail item is active for a pathname (Backlog → Board, session detail → Sessions). */
export function activeViewFor(pathname: string): PrimaryViewId | null {
  const segment = pathname.split("/")[1] ?? "";
  if (segment === "") return "now";
  if (segment === "backlog") return "board";
  return (PRIMARY_VIEWS as readonly string[]).includes(segment) ? (segment as PrimaryViewId) : null;
}
