import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { world } from "@/features/world/worldFixture";
import { EMPTY_KIT_CONFIG, parseKitConfig } from "./config";
import { formatValue, MediaKit } from "./MediaKit";
import { buildKit } from "./model";

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

  it("with Ana's content: line, cases, packages, add-ons and exactly one button", () => {
    const config = parseKitConfig({
      tagline: "Her own words",
      contact: { email: "hi@example.com", label: "Let's talk" },
      cases: [{ brand: "Brand A", title: "Launch", results: [{ label: "Views", value: "1.2M" }] }],
      packages: [{ name: "One Reel", price: "from €1,500", includes: ["1 Reel", "3 Stories"] }],
      addons: [{ name: "Usage rights", price: "+20–50 % of the fee" }],
    });
    render(<MediaKit model={buildKit({ world: world(), config })} />);
    expect(screen.getByTestId("kit-tagline").textContent).toBe("Her own words");
    expect(screen.getByTestId("kit-proof").textContent).toContain("1.2M");
    expect(screen.getByTestId("kit-package-list").textContent).toContain("from €1,500");
    expect(screen.getByTestId("kit-addons").textContent).toContain("+20–50 % of the fee");
    const button = within(screen.getByTestId("kit-cta")).getByRole("link");
    expect(button.getAttribute("href")).toBe("mailto:hi@example.com");
    expect(button.textContent).toBe("Let's talk");
    // without `preview` there is no internal bar
    expect(screen.queryByTestId("kit-preview")).toBeNull();
  });

  it("numbers render their final value (what assistive technology reads)", () => {
    render(<MediaKit model={buildKit({ world: world(), config: EMPTY_KIT_CONFIG })} />);
    expect(screen.getByTestId("kit-tile-followers").textContent).toContain("5,010");
    expect(screen.getByTestId("kit-tile-watch").textContent).toContain("28.1 s");
    expect(screen.getByTestId("kit-tile-hold").textContent).toContain("65.5%");
  });

  it("formats counts compact from 10,000 on", () => {
    expect(formatValue(9_999, "count")).toBe("9,999");
    expect(formatValue(48_200, "count")).toBe("48.2K");
    expect(formatValue(1_250_000, "count")).toBe("1.3M");
    expect(formatValue(4.04, "percent")).toBe("4.0%");
  });
});
