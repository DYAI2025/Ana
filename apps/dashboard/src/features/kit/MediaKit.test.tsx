import { act, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { series, world } from "@/features/world/worldFixture";
import { EMPTY_KIT_CONFIG, parseKitConfig } from "./config";
import { formatValue } from "./format";
import { MediaKit } from "./MediaKit";
import { buildKit } from "./model";
import { CountUp } from "./motion";

const finalOf = (testid: string) => screen.getByTestId(testid).querySelector("[data-final]")!;

describe("MediaKit", () => {
  it("an empty config shows no case studies, packages, add-ons, line or button — not even as placeholders", () => {
    render(<MediaKit model={buildKit({ world: world(), config: EMPTY_KIT_CONFIG })} preview />);
    for (const id of ["kit-proof", "kit-packages", "kit-addons", "kit-cta", "kit-tagline"]) expect(screen.queryByTestId(id)).toBeNull();
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
    expect(button.getAttribute("href")).toBe("mailto:hi@example.com");
    expect(button.textContent).toBe("Let's talk");
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

describe("CountUp", () => {
  let fire: (visible: boolean) => void = () => undefined;
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  function motion(reduce: boolean) {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: (e: Array<{ isIntersecting: boolean }>) => void) {
          fire = (v) => cb([{ isIntersecting: v }]);
        }
        observe() {}
        disconnect() {}
      },
    );
    // every frame is the last one: the count lands on the final value at once
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => {
      f(performance.now() + 10_000);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
  }

  it("starts at 0 until seen, then lands on the final value; assistive technology always reads the final value", () => {
    motion(false);
    const { container } = render(<CountUp value={48_200} kind="count" />);
    const shown = container.querySelector("[data-final]")!;
    expect(shown.textContent).toBe("0");
    expect(container.textContent).toContain("48.2K");
    act(() => fire(true));
    expect(shown.textContent).toBe("48.2K");
  });

  it("printing or saving as PDF shows the final value even when it was never seen", () => {
    motion(false);
    const { container } = render(<CountUp value={131_000} kind="count" />);
    const shown = container.querySelector("[data-final]")!;
    expect(shown.textContent).toBe("0");
    act(() => {
      window.dispatchEvent(new Event("beforeprint"));
    });
    expect(shown.textContent).toBe("131K");
  });

  it("a new value is shown, never the old one; reduced motion never animates", () => {
    motion(false);
    const { container, rerender } = render(<CountUp value={10} kind="count" />);
    act(() => fire(true));
    rerender(<CountUp value={20} kind="count" />);
    act(() => fire(true));
    expect(container.querySelector("[data-final]")!.textContent).toBe("20");
    vi.unstubAllGlobals();
    motion(true);
    const reduced = render(<CountUp value={30} kind="count" />);
    expect(reduced.container.querySelector("[data-final]")!.textContent).toBe("30");
  });
});
