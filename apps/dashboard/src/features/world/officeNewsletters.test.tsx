import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "@/components/providers/I18nProvider";
import { instagramView } from "./model";
import { NEWSLETTERS_OFF } from "./newsletters";
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

describe("the office board — what paid newsletters write about each topic", () => {
  it("names the newsletters and links their posts under 'Why?'; topics without a post say so", () => {
    show(world());
    expect(screen.getByTestId("office-newsletters-asof").textContent).toBe("Newsletters: 7 of 8 feeds read, last on Nov 3; 38 of 40 posts matched to topics.");
    expect(screen.getByTestId("office-newsletters-ugc-gigs").textContent).toBe("Paid newsletters: 2 of 7 wrote about it in the last 30 days (Travel Creator Gigs, Life Unscripted; 2 post(s)).");
    expect(screen.getByTestId("office-newsletters-homesick").textContent).toBe("Paid newsletters: none of the 7 we follow wrote about it in the last 30 days.");
    const topic = screen.getByTestId("office-topic-ugc-gigs");
    const link = within(topic).getByRole("link", { name: "A brand is hiring travel creators" });
    expect(link.getAttribute("href")).toBe("https://travelcreatorgigs.substack.com/p/a-brand");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(within(topic).getByText("What paid newsletters write")).toBeTruthy();
    expect(screen.getByText(/Newsletters do not move the dots\./)).toBeTruthy();
  });

  it("without the reader (or before the first read) no topic claims anything about newsletters", () => {
    show({ ...world(), newsletters: NEWSLETTERS_OFF });
    expect(screen.getByTestId("office-newsletters-asof").textContent).toBe("Newsletters are not read yet (no model key on the server).");
    expect(screen.queryByTestId("office-newsletters-ugc-gigs")).toBeNull();
  });

  it("feeds read but nothing matched yet: the status says so, the topics stay silent", () => {
    show({ ...world(), newsletters: { ...world().newsletters, read: 0, topics: {} } });
    expect(screen.getByTestId("office-newsletters-asof").textContent).toContain("0 of 40 posts matched");
    expect(screen.queryByTestId("office-newsletters-ugc-gigs")).toBeNull();
  });
});
