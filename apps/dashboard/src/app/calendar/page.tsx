import { CalendarView } from "@/features/calendar/CalendarView";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ event?: string | string[] }> }) {
  const { event } = await searchParams;
  const highlight = typeof event === "string" ? event : undefined;
  return <CalendarView key={highlight ?? "none"} highlight={highlight} />;
}
