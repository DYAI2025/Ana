import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/providers/I18nProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { getSession } from "@/fixtures/sessions";
import { SessionDetail } from "./SessionDetail";

const renderDetail = () =>
  render(
    <I18nProvider>
      <ToastProvider>
        <SessionDetail session={getSession("working-session-01")!} initialTab="watch" />
      </ToastProvider>
    </I18nProvider>,
  );

describe("session placeholder player", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("stops by itself at the end and restarts from zero on Play", () => {
    renderDetail();
    const toggle = screen.getByTestId("player-toggle");
    const bar = screen.getByRole("progressbar");
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent("Pause");
    act(() => vi.advanceTimersByTime(30_000));
    expect(bar).toHaveAttribute("aria-valuenow", "4320");
    expect(toggle).toHaveTextContent("Play");
    fireEvent.click(toggle);
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    expect(toggle).toHaveTextContent("Pause");
  });
});

describe("session tabs", () => {
  it("supports arrow keys and shows the fictional transcript marker", () => {
    renderDetail();
    const watch = screen.getByTestId("tab-watch");
    watch.focus();
    fireEvent.keyDown(watch, { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByTestId("tab-summary"), { key: "ArrowRight" });
    expect(screen.getByTestId("tab-transcript")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("panel-transcript")).toHaveTextContent("not a real conversation");
    fireEvent.keyDown(screen.getByTestId("tab-transcript"), { key: "End" });
    expect(JSON.parse(screen.getByTestId("session-json").textContent!)).toMatchObject({ prototype: true, fictional: true });
  });
});
