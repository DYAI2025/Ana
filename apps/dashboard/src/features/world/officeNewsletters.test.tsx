import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "@/components/providers/I18nProvider";
import { instagramView } from "./model";
import { NEWSLETTERS_OFF, type WorldNewsletters } from "./newsletters";
import { OfficeBoard } from "./OfficeRoom";
import type { WorldPayload } from "./types";
import { world } from "./worldFixture";

function Board({ w }: { w: WorldPayload }) {
  const { t, locale } = useI18n();
  return <OfficeBoard world={w} posts={instagramView(w).posts} t={t} locale={locale} onPost={() => undefined} />;
}

const show = (w: WorldPayload) =>
  render(
    <I18nProvider>
      <Board w={w} />
    </I18nProvider>,
  );
const withNl = (patch: Partial<WorldNewsletters>): WorldPayload => {
  const w = world();
  return { ...w, newsletters: { ...w.newsletters, ...patch } };
};

describe("the office board — what paid newsletters write about each topic", () => {
  it("names the newsletters, counts all their posts, says since when it is covered, and links the newest under 'Why?'", () => {
    show(world());
    expect(screen.getByTestId("office-newsletters-asof").textContent).toBe("Newsletters: 6 of 6 feeds read, last on Nov 4; 40 of 40 posts checked against the topics.");
    expect(screen.getByTestId("office-newsletters-ugc-gigs").textContent).toBe("Paid newsletters: 2 of 6 on these themes wrote about it since Oct 30 (Travel Creator Gigs, Life Unscripted; 12 post(s)).");
    expect(screen.getByTestId("office-newsletters-homesick").textContent).toBe("Paid newsletters: none of the 6 on these themes wrote about it since Oct 30.");
    expect(screen.getByTestId("office-newsletters-check").textContent).toBe(
      "Check: the newsletters on these themes (6 read) touch one of the topics in 50% of their checked posts, the broad travel ones (2 read) in 17%. If both were alike, the matching would see the topics everywhere.",
    );
    const topic = screen.getByTestId("office-topic-ugc-gigs");
    const link = within(topic).getByRole("link", { name: "A brand is hiring travel creators" });
    expect(link.getAttribute("href")).toBe("https://travelcreatorgigs.substack.com/p/a-brand");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(within(topic).getByText("What paid newsletters write")).toBeTruthy();
    expect(screen.getByText(/Newsletters do not move the dots\./)).toBeTruthy();
  });

  it("the check line needs enough checked posts on both sides and names the newsletters actually read", () => {
    const w = world();
    const few = show({ ...w, newsletters: { ...w.newsletters, check: { core: w.newsletters.check.core, control: { feeds: 1, checked: 9, matched: 0 } } } });
    expect(screen.queryByTestId("office-newsletters-check")).toBeNull();
    few.unmount();
    show({ ...w, newsletters: { ...w.newsletters, check: { core: { feeds: 5, checked: 10, matched: 5 }, control: { feeds: 1, checked: 10, matched: 1 } } } });
    expect(screen.getByTestId("office-newsletters-check").textContent).toContain("the newsletters on these themes (5 read) touch one of the topics in 50%");
    expect(screen.getByTestId("office-newsletters-check").textContent).toContain("the broad travel ones (1 read) in 10%");
  });

  it("a fully covered window says 'in the last 30 days'", () => {
    show(withNl({ since: null }));
    expect(screen.getByTestId("office-newsletters-homesick").textContent).toBe("Paid newsletters: none of the 6 on these themes wrote about it in the last 30 days.");
  });

  it("'none' only when every post is checked and no feed fails; otherwise 'none so far'", () => {
    show(withNl({ checked: 24, complete: false }));
    expect(screen.getByTestId("office-newsletters-homesick").textContent).toBe("Paid newsletters: none so far (24 of 40 posts checked).");
    // a topic with hits still shows them
    expect(screen.getByTestId("office-newsletters-ugc-gigs").textContent).toContain("2 of 6");
  });

  it("failing feeds and unreadable posts are named in the status", () => {
    show(withNl({ feeds_failing: 1, unreadable: 3, complete: false }));
    expect(screen.getByTestId("office-newsletters-asof").textContent).toBe(
      "Newsletters: 6 of 6 feeds read, last on Nov 4; 40 of 40 posts checked against the topics. 1 feed(s) could not be read at the last try. 3 post(s) could not be checked.",
    );
    expect(screen.getByTestId("office-newsletters-homesick").textContent).toBe("Paid newsletters: none so far (40 of 40 posts checked).");
  });

  it("without the reader no topic and no method note claims anything about newsletters", () => {
    show({ ...world(), newsletters: NEWSLETTERS_OFF });
    expect(screen.getByTestId("office-newsletters-asof").textContent).toBe("Newsletters are not read yet (no model key on the server).");
    expect(screen.queryByTestId("office-newsletters-ugc-gigs")).toBeNull();
    expect(screen.queryByTestId("office-newsletters-check")).toBeNull();
    expect(screen.queryByText(/Newsletters do not move the dots/)).toBeNull();
  });

  it("before anything is checked, or when no feed could ever be read, or the store is broken, the topics stay silent", () => {
    const quiet = { read_at: null, feeds_read: 0, checked: 0, posts: 0, complete: false, topics: {}, check: { core: { feeds: 0, checked: 0, matched: 0 }, control: { feeds: 0, checked: 0, matched: 0 } } };
    const first = show(withNl({ ...quiet, feeds_failing: 8 }));
    expect(screen.getByTestId("office-newsletters-asof").textContent).toBe("Newsletters: no feed could be read so far (8 tried).");
    expect(screen.queryByTestId("office-newsletters-ugc-gigs")).toBeNull();
    first.unmount();
    const second = show(withNl(quiet));
    expect(screen.getByTestId("office-newsletters-asof").textContent).toBe("Newsletters: the feeds have not been read yet.");
    second.unmount();
    show(withNl({ ...quiet, store_error: true }));
    expect(screen.getByTestId("office-newsletters-asof").textContent).toBe("Newsletters: the saved readings could not be loaded, so nothing is read until that is fixed.");
  });
});

describe("the office board — Ana's older posts", () => {
  const hp = (id: string, day: string, ssr = 0.015) => ({ id, published_at: `${day}T10:00:00.000Z`, format: "reel" as const, cover: null, reach: 1000, saves: 10, shares: 5, ssr });
  const history = (patch: Partial<WorldPayload["post_history"]> = {}): WorldPayload["post_history"] => ({
    state: "on",
    fetched_at: "2026-11-05T00:00:00.000Z",
    total: 200,
    oldest: "2026-07-03T10:00:00.000Z",
    posts: [hp("h1", "2026-10-01"), hp("h2", "2026-07-03")],
    waiting: 12,
    list_failing: null,
    numbers_failing: null,
    store_error: false,
    ...patch,
  });

  it("says how far back the board reads and what is still being read; the older posts count as read", () => {
    const w = world();
    show({ ...w, post_history: history() });
    expect(screen.getByTestId("office-history").textContent).toBe("Ana's posts on the board: her last 200, back to Jul 3, 2026. Saves & shares of 12 older post(s) are still being read.");
    expect(screen.getByTestId("office-asof").textContent).toContain("of 7 checked");
  });

  it("names a failed list and failed numbers separately; nothing when off", () => {
    const w = world();
    const a = show({ ...w, post_history: history({ total: 0, oldest: null, posts: [], waiting: 0, list_failing: "http-502" }) });
    expect(screen.getByTestId("office-history").textContent).toBe("The list of her older posts could not be read at the last try.");
    a.unmount();
    const b = show({ ...w, post_history: history({ waiting: 0, numbers_failing: "http-502" }) });
    expect(screen.getByTestId("office-history").textContent).toBe("Ana's posts on the board: her last 200, back to Jul 3, 2026. The numbers of her older posts could not be read at the last try; the next try is in an hour.");
    b.unmount();
    show(w);
    expect(screen.queryByTestId("office-history")).toBeNull();
  });

  it("an older post on a topic is shown as a picture, not as a button that would open an empty panel", () => {
    const w = world();
    const h = ["h1", "h2", "h3"];
    show({ ...w, post_history: history({ posts: h.map((id) => hp(id, "2026-08-01", 0.9)) }), post_topics: { ...w.post_topics, topics: { ...w.post_topics.topics, h1: ["homesick"], h2: ["homesick"], h3: ["homesick"] } } });
    const topic = screen.getByTestId("office-topic-homesick");
    expect(within(topic).getAllByTestId("office-older-cover")).toHaveLength(3);
    expect(within(topic).queryAllByRole("button")).toHaveLength(0);
  });
});
