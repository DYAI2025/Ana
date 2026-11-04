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
    expect(screen.getByTestId("office-newsletters-asof").textContent).toBe("Newsletters: 6 of 6 feeds read, last on Nov 3; 40 of 40 posts checked against the topics.");
    expect(screen.getByTestId("office-newsletters-ugc-gigs").textContent).toBe("Paid newsletters: 2 of 6 on these themes wrote about it since Oct 30 (Travel Creator Gigs, Life Unscripted; 12 post(s)).");
    expect(screen.getByTestId("office-newsletters-homesick").textContent).toBe("Paid newsletters: none of the 6 on these themes wrote about it since Oct 30.");
    expect(screen.getByTestId("office-newsletters-check").textContent).toBe(
      "Check: the 6 newsletters on these themes touch one of the topics in 50% of their checked posts, the 2 broad travel ones in 17%. If both were alike, the matching would see the topics everywhere.",
    );
    const topic = screen.getByTestId("office-topic-ugc-gigs");
    const link = within(topic).getByRole("link", { name: "A brand is hiring travel creators" });
    expect(link.getAttribute("href")).toBe("https://travelcreatorgigs.substack.com/p/a-brand");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(within(topic).getByText("What paid newsletters write")).toBeTruthy();
    expect(screen.getByText(/Newsletters do not move the dots\./)).toBeTruthy();
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
      "Newsletters: 6 of 6 feeds read, last on Nov 3; 40 of 40 posts checked against the topics. 1 feed(s) could not be read at the last try. 3 post(s) could not be checked.",
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
    const quiet = { read_at: null, feeds_read: 0, checked: 0, posts: 0, complete: false, topics: {}, check: { core: { checked: 0, matched: 0 }, control: { checked: 0, matched: 0 } } };
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
