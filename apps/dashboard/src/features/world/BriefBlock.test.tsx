import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { translate, type MessageKey, type MessageParams } from "@/i18n/translate";
import type { Locale } from "@/lib/locale";
import { BriefBlock } from "./BriefBlock";
import type { BriefRecord } from "./brief";
import { NOW, world } from "./worldFixture";

const record = (locale: Locale, headline: string, fact: string): BriefRecord => ({
  locale,
  at: new Date(NOW - 60_000).toISOString(),
  week: "2026-w45",
  kind: "now",
  model: "claude-haiku-5-5",
  facts: [{ id: "F1", kind: "market", text: fact }],
  brief: {
    headline,
    patterns: [{ kind: "audience", title: `${headline} title`, text: `${headline} text`, facts: ["F1"], counter: null, counter_facts: [], strength: "medium" }],
    brands: null,
    substack: null,
    next_test: null,
    limits: [],
    dropped: 0,
  },
});

function show(locale: Locale, latest: Partial<Record<Locale, BriefRecord>>) {
  const w = world();
  w.brief = { state: "on", busy: false, latest, weekly: {}, in_brain: false, brain: false, reason: null };
  const t = (key: MessageKey, params?: MessageParams) => translate(locale, key, params);
  return render(<BriefBlock world={w} posts={[]} t={t} locale={locale} ago={() => "now"} onPost={() => undefined} />);
}

const de = record("de", "Tier-1-Länder holen auf", "Engagement der letzten 7 Tage nach Werbemarkt: Tier 1 34 %.");
const en = record("en", "Top markets are catching up", "Engagement of the last 7 days by ad market: Tier 1 34 %.");

describe("BriefBlock shows the brief of the dashboard language only", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("English shows the English brief and its English facts, never the German one", () => {
    show("en", { de, en });
    const body = screen.getByTestId("world-brief-body");
    expect(body).toHaveTextContent("Top markets are catching up");
    expect(body).toHaveTextContent("Engagement of the last 7 days by ad market");
    expect(body).not.toHaveTextContent("Tier-1-Länder");
    expect(body).not.toHaveTextContent("Werbemarkt");
  });

  it("German shows the German brief", () => {
    show("de", { de, en });
    expect(screen.getByTestId("world-brief-body")).toHaveTextContent("Tier-1-Länder holen auf");
  });

  it("a brief that exists only in another language is not shown; the reader is told to press the button", () => {
    show("it", { de, en });
    expect(screen.queryByTestId("world-brief-body")).toBeNull();
    expect(screen.getByTestId("world-brief-none")).toHaveTextContent("Ancora nessun brief in italiano");
  });

  it("the button asks for a brief in the dashboard language and shows it", async () => {
    const it = record("it", "I mercati top recuperano", "Engagement degli ultimi 7 giorni per mercato pubblicitario: Tier 1 34 %.");
    const fetchMock = vi.fn(async () => Response.json({ ok: true, fresh: true, brief: it }));
    vi.stubGlobal("fetch", fetchMock);
    show("it", { de });
    fireEvent.click(screen.getByTestId("world-brief-button"));
    await waitFor(() => expect(screen.getByTestId("world-brief-body")).toHaveTextContent("I mercati top recuperano"));
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body))).toEqual({ locale: "it" });
  });
});
