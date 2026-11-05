import { act, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { series, world } from "@/features/world/worldFixture";
import { EMPTY_KIT_CONFIG, parseKitConfig } from "./config";
import { formatValue } from "./format";
import { MediaKit } from "./MediaKit";
import { buildKit } from "./model";
import { CountUp, Reveal } from "./motion";

const finalOf = (testid: string) => screen.getByTestId(testid).querySelector("[data-final]")!;

describe("MediaKit", () => {
  it("an empty config shows no case studies, packages, add-ons, line or button — not even as placeholders", () => {
    render(<MediaKit model={buildKit({ world: world(), config: EMPTY_KIT_CONFIG })} preview />);
    for (const id of ["kit-proof", "kit-packages", "kit-addons", "kit-cta", "kit-tagline", "kit-partners", "kit-hero-cta", "kit-reel-label", "kit-hero-signal"]) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Ana Savu");
    expect(screen.getByTestId("kit-numbers")).toBeTruthy();
    const text = screen.getByTestId("kit").textContent ?? "";
    expect(text).not.toMatch(/—|NaN|undefined|null/);
    // the preview names what is not shown
    expect(within(screen.getByTestId("kit-hidden")).getByText(/Case studies/)).toBeTruthy();
  });

  it("with Ana's content: line, cases, packages, add-ons and exactly one button; no preview bar for brands", () => {
    const config = parseKitConfig({
      tagline: "Her own words",
      contact: { email: "hi@example.com", label: "Let's talk" },
      cases: [{ brand: "Brand A", title: "Launch", results: [{ label: "Views", value: "1.2M" }] }],
      packages: [{ name: "One Reel", price: "from €1,500", includes: ["1 Reel", "3 Stories"] }],
      addons: [{ name: "Usage rights", price: "+20–50 % of the fee" }],
      presets: { "secret-brand": { label: "Secret Brand Pitch" } },
    });
    render(<MediaKit model={buildKit({ world: world(), config })} />);
    expect(screen.getByTestId("kit-tagline").textContent).toBe("Her own words");
    expect(screen.getByTestId("kit-proof").textContent).toContain("1.2M");
    expect(screen.getByTestId("kit-package-list").textContent).toContain("from €1,500");
    expect(screen.getByTestId("kit-addons").textContent).toContain("+20–50 % of the fee");
    const button = within(screen.getByTestId("kit-cta")).getByRole("link");
    expect(button.getAttribute("href")).toMatch(/^mailto:hi@example\.com\?body=Brand%3A/);
    expect(button.textContent).toBe("Let's talk");
    // one way to write, one button: the hero link leads down to it
    expect(screen.getByTestId("kit-hero-cta").getAttribute("href")).toBe("#kit-cta");
    expect(screen.getByTestId("kit-cta").id).toBe("kit-cta");
    expect(document.querySelectorAll('a[href^="mailto:"]')).toHaveLength(1);
    expect(screen.queryByTestId("kit-preview")).toBeNull();
    // other brands' presets are not on a brand's page
    expect(document.body.textContent).not.toContain("Secret Brand Pitch");
  });

  it("numbers render their final value; the hero says the period", () => {
    render(<MediaKit model={buildKit({ world: world(), config: EMPTY_KIT_CONFIG })} />);
    expect(finalOf("kit-tile-followers").textContent).toBe("5,010");
    expect(finalOf("kit-tile-watch").textContent).toBe("28.1 s");
    expect(finalOf("kit-tile-hold").textContent).toBe("65.5%");
    expect(screen.getByTestId("kit-hero-reach").textContent).toContain("Last 28 days");
  });

  it("both country groups share one scale: a bar's length compares with every country", () => {
    const w = world();
    w.audience.engaged_country = series([["DE", 40], ["IN", 10], ["US", 30], ["TH", 5], ["ES", 15]]);
    render(<MediaKit model={buildKit({ world: w, config: EMPTY_KIT_CONFIG, presetId: "asia" })} />);
    const widths = (id: string) => Array.from(screen.getByTestId(id).querySelectorAll("[data-width]")).map((e) => Number(e.getAttribute("data-width")));
    expect(widths("kit-countries-focus")).toEqual([25, 12.5]);
    expect(widths("kit-countries")).toEqual([100, 75, 37.5]);
    expect(screen.getByTestId("kit-focus").textContent).toContain("15%");
  });

  it("formats counts compact from 10,000 on, shares as whole percents", () => {
    expect(formatValue(9_999, "count")).toBe("9,999");
    expect(formatValue(48_200, "count")).toBe("48.2K");
    expect(formatValue(1_250_000, "count")).toBe("1.3M");
    expect(formatValue(4.04, "percent")).toBe("4.0%");
    expect(formatValue(0.404, "share")).toBe("40%");
  });
});

describe("MediaKit — ANA-54", () => {
  it("partners, Reel labels, a case without results, case facts and the market signal", () => {
    const config = parseKitConfig({
      partners: [{ name: "Fiverr", kind: "paid" }, { name: "ClassPass", kind: "affiliate" }, { name: "Named Only" }],
      reels: { p1: { kind: "partnership", brand: "Fiverr" } },
      cases: [
        { brand: "Fiverr", role: "Concept and filming", deliverables: ["1 Reel", "3 Stories"] },
        { brand: "Proven", results: [{ label: "Views", value: "1.2M" }], period: "30 days after posting", source: "Instagram Insights" },
      ],
    });
    const w = world();
    if (w.instagram.ok) w.instagram.snapshot.posts = w.instagram.snapshot.posts.map((p) => ({ ...p, observations: [...p.observations, { ...p.observations[0]!, metric_name: "views" as const, value: 1000 }] }));
    render(<MediaKit model={buildKit({ world: w, config, presetId: "asia" })} />);
    const partners = screen.getByTestId("kit-partners");
    expect(partners.textContent).toContain("Fiverr");
    expect(partners.textContent).toContain("Paid partnership");
    expect(partners.textContent).toContain("Affiliate");
    // a brand named without a kind: the name alone, no claim about how they worked together
    expect(within(partners).getByText("Named Only").parentElement!.textContent).toBe("Named Only");
    expect(screen.getByTestId("kit-reel-label").textContent).toBe("Brand partnership · Fiverr");
    const proof = screen.getByTestId("kit-proof");
    expect(screen.getAllByTestId("kit-case-no-results").map((e) => e.textContent)).toEqual(["Collaboration · no published results"]);
    expect(proof.textContent).toContain("Concept and filming");
    expect(proof.textContent).toContain("1 Reel · 3 Stories");
    expect(proof.textContent).toContain("Measured · 30 days after posting · source: Instagram Insights");
    expect(screen.getByTestId("kit-hero-signal").textContent).toContain("Asia-Pacific & India");
    expect(screen.getByTestId("kit-hero-signal").textContent).toContain("Engaged accounts, last 30 days, by country");
    // every number names its source
    expect(screen.getByTestId("kit-tile-reach").textContent).toContain("Instagram ·");
  });

  it("an old reading is not called live", () => {
    const w = world();
    const at = Date.parse(w.instagram.ok ? w.instagram.snapshot.observed_at : "");
    const { unmount } = render(<MediaKit model={buildKit({ world: w, config: EMPTY_KIT_CONFIG, now: at + 1000 })} />);
    expect(screen.getByTestId("kit-as-of").textContent).toMatch(/^Numbers live from Instagram/);
    unmount();
    render(<MediaKit model={buildKit({ world: w, config: EMPTY_KIT_CONFIG, now: at + 30 * 3_600_000 })} />);
    expect(screen.getByTestId("kit-as-of").textContent).toMatch(/^Numbers from Instagram.*latest available reading/);
    // nowhere on the page: not in the heading, not in the footer
    expect(screen.getByTestId("kit").textContent).not.toMatch(/live/i);
  });
});

describe("CountUp", () => {
  let observers: Record<string, (e: Array<{ isIntersecting: boolean }>) => void> = {};
  // the observer that starts the count (any pixel visible) unless a margin is named ("near" = 35% below the viewport,
  // Reveal's "seen" = 8% above the bottom edge)
  const fire = (visible: boolean, margin = "0px") => observers[margin]?.([{ isIntersecting: visible }]);
  const SEEN = "0px 0px -8% 0px";
  let frames: FrameRequestCallback[] = [];
  const flush = () => {
    const f = frames;
    frames = [];
    f.forEach((cb) => cb(performance.now() + 10_000));
  };
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    observers = {};
    frames = [];
  });
  const scroll = () => act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
  function motion(reduce: boolean, below = true) {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: (e: Array<{ isIntersecting: boolean }>) => void, options?: { rootMargin?: string }) {
          observers[options?.rootMargin ?? ""] = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => {
      frames.push(f);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {
      frames = [];
    });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ top: below ? 5_000 : 10 } as DOMRect);
  }

  it("shows its final value until it is about to scroll in, then counts from 0 to it", () => {
    motion(false);
    const { container } = render(<CountUp value={48_200} kind="count" />);
    const shown = container.querySelector("[data-final]")!;
    // never scrolled: a full-page screenshot or PDF shows the real number, never 0, even near the fold
    act(() => fire(true));
    expect(shown.textContent).toBe("48.2K");
    scroll();
    // about to scroll in: 0; in view: the count runs where it can be watched
    act(() => fire(true, "0px 0px 35% 0px"));
    expect(shown.textContent).toBe("0");
    expect(frames).toHaveLength(0);
    act(() => fire(true));
    expect(frames.length).toBeGreaterThan(0);
    act(() => flush());
    expect(shown.textContent).toBe("48.2K");
    expect(container.textContent).toContain("48.2K");
  });

  it("printing in the middle of the count shows the final value", () => {
    motion(false);
    const { container } = render(<CountUp value={131_000} kind="count" />);
    const shown = container.querySelector("[data-final]")!;
    scroll();
    act(() => fire(true));
    expect(shown.textContent).toBe("0");
    act(() => {
      window.dispatchEvent(new Event("beforeprint"));
    });
    expect(shown.textContent).toBe("131K");
  });

  it("a new value is shown, never the old one; on screen at load or with reduced motion it never animates", () => {
    motion(false);
    const { container, rerender } = render(<CountUp value={10} kind="count" />);
    scroll();
    act(() => fire(true));
    rerender(<CountUp value={20} kind="count" />);
    expect(container.querySelector("[data-final]")!.textContent).toBe("20");
    scroll();
    act(() => fire(true));
    act(() => flush());
    expect(container.querySelector("[data-final]")!.textContent).toBe("20");
    vi.restoreAllMocks();
    motion(false, false);
    const onScreen = render(<CountUp value={40} kind="count" />);
    scroll();
    act(() => fire(true));
    expect(onScreen.container.querySelector("[data-final]")!.textContent).toBe("40");
    vi.unstubAllGlobals();
    motion(true);
    const reduced = render(<CountUp value={30} kind="count" />);
    scroll();
    act(() => fire(true));
    expect(reduced.container.querySelector("[data-final]")!.textContent).toBe("30");
  });

  it("Reveal: shown until someone scrolls; then hidden when about to scroll in, risen in when seen or printed", () => {
    motion(false);
    const { getByTestId, unmount } = render(
      <Reveal data-testid="r">
        <p>x</p>
      </Reveal>,
    );
    const el = getByTestId("r");
    act(() => fire(true, "0px 0px 35% 0px"));
    expect(el.dataset.reveal).toBeUndefined();
    scroll();
    act(() => fire(true, "0px 0px 35% 0px"));
    expect(el.dataset.reveal).toBe("wait");
    act(() => fire(true, SEEN));
    expect(el.dataset.reveal).toBe("in");
    unmount();
    const printed = render(
      <Reveal data-testid="p">
        <p>y</p>
      </Reveal>,
    );
    scroll();
    act(() => fire(true, "0px 0px 35% 0px"));
    act(() => {
      window.dispatchEvent(new Event("beforeprint"));
    });
    expect(printed.getByTestId("p").dataset.reveal).toBe("in");
  });
});
