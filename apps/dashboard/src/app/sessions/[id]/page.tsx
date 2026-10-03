import { notFound } from "next/navigation";
import { getSession, SESSIONS } from "@/fixtures/sessions";
import { SessionDetail } from "@/features/sessions/SessionDetail";
import { parseTab } from "@/features/sessions/tabs";

export function generateStaticParams() {
  return SESSIONS.map((session) => ({ id: session.id }));
}

export default async function SessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string | string[] }> }) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const session = getSession(id);
  if (!session) notFound();
  // key: a tab change from a link remounts the detail on that tab
  return <SessionDetail key={`${id}-${String(tab)}`} session={session} initialTab={parseTab(tab)} />;
}
