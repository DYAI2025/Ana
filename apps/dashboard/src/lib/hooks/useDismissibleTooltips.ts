"use client";

import { useEffect, type RefObject } from "react";

/**
 * WCAG 1.4.13 for CSS tooltips (`[data-label]::after`): Escape — pressed anywhere — hides only the label that is
 * currently shown (hovered or focused item inside `container`). It shows again once pointer/focus leaves that item.
 * Styles hide a label when its element carries `data-tip-off`.
 */
export function useDismissibleTooltips(container: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const shown = (): HTMLElement[] => {
      const hovered = Array.from(root.querySelectorAll<HTMLElement>("[data-label]:hover"));
      const focused = document.activeElement instanceof HTMLElement && root.contains(document.activeElement) ? [document.activeElement.closest<HTMLElement>("[data-label]")] : [];
      return [...hovered, ...focused].filter((el): el is HTMLElement => !!el);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      shown().forEach((el) => el.setAttribute("data-tip-off", ""));
    };
    const onLeave = (event: Event) => {
      const el = (event.target as Element | null)?.closest?.("[data-tip-off]");
      const next = (event as PointerEvent | FocusEvent).relatedTarget as Node | null;
      if (el && !(next && el.contains(next))) el.removeAttribute("data-tip-off");
    };
    document.addEventListener("keydown", onKeyDown);
    root.addEventListener("pointerout", onLeave);
    root.addEventListener("focusout", onLeave);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("pointerout", onLeave);
      root.removeEventListener("focusout", onLeave);
    };
  }, [container]);
}
