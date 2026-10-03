/** Calendar month maths in plain UTC dates (no time zones involved — events are local wall-clock). */
export interface YearMonth {
  year: number;
  /** 1–12 */
  month: number;
}

export interface GridDay {
  date: string;
  inMonth: boolean;
}

export const isoDate = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** Weeks of 7 days, Monday first, padded with neighbouring-month days. */
export function monthGrid(year: number, month: number): GridDay[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7;
  const total = Math.ceil((leading + daysInMonth) / 7) * 7;
  const days: GridDay[] = [];
  for (let i = 0; i < total; i += 1) {
    const d = new Date(Date.UTC(year, month - 1, 1 - leading + i));
    days.push({
      date: isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
      inMonth: d.getUTCMonth() === month - 1,
    });
  }
  const weeks: GridDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}
