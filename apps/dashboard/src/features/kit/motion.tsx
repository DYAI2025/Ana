"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatValue } from "./format";
import type { KitValueKind } from "./model";
import styles from "./kit.module.css";

/**
 * The media kit's only client parts (ANA-53): sections that rise in, numbers that count up, covers that fall back when
 * Meta's CDN link fails. The page itself renders on the server, so only these props travel to the browser.
 * With reduced motion (or without JavaScript) everything is simply there with its final numbers; a print, PDF or
 * full-page screenshot shows every number and section in full, scrolled to or not.
 */

const reducedMotion = () => typeof window === "undefined" || !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const belowFold = (el: Element) => el.getBoundingClientRect().top > window.innerHeight;
/**
 * Nothing is hidden or set to 0 before someone scrolls, and then only what is about to scroll in (this far below the
 * viewport): a full-page screenshot, a PDF or a print of a page that was never scrolled shows every section and every
 * final number.
 */
const NEAR = "0px 0px 35% 0px";
/** seen: well inside the viewport, where the motion can be watched */
const SEEN = "0px 0px -8% 0px";

/** runs `arm` on the first scroll; returns the cleanup of whatever `arm` set up */
function onFirstScroll(arm: () => () => void): () => void {
  let disarm: (() => void) | null = null;
  const go = () => {
    window.removeEventListener("scroll", go);
    disarm = arm();
  };
  window.addEventListener("scroll", go, { passive: true });
  return () => {
    window.removeEventListener("scroll", go);
    disarm?.();
  };
}

export function Reveal({ children, className, as: Tag = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" } & Partial<Record<`data-${string}` | "aria-labelledby" | "id", string>>) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || !("IntersectionObserver" in window) || !belowFold(el)) return;
    return onFirstScroll(() => {
      const show = () => {
        el.dataset.reveal = "in";
        near.disconnect();
        seen.disconnect();
      };
      // approaching: hide it so it can rise in; seen: let it rise in
      const near = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting) && !el.dataset.reveal) el.dataset.reveal = "wait";
      }, { rootMargin: NEAR });
      const seen = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && show(), { rootMargin: SEEN });
      near.observe(el);
      seen.observe(el);
      window.addEventListener("beforeprint", show);
      return () => {
        near.disconnect();
        seen.disconnect();
        window.removeEventListener("beforeprint", show);
      };
    });
  }, []);
  return (
    <Tag ref={ref as never} className={`${styles.reveal} ${className ?? ""}`} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * A number that counts up from 0 when it scrolls into view (after someone scrolled; just before, it shows 0). Until then it shows its final value (so does the
 * server, and assistive technology reads a separate copy of it). The animation writes the text node React rendered
 * (never replaces it), and every way out — printing, unmounting, a new value — puts back the final value from
 * data-final, which React keeps current.
 */
export function CountUp({ value, kind }: { value: number; kind: KitValueKind }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    const node = el?.firstChild;
    if (!el || !node || node.nodeType !== Node.TEXT_NODE || reducedMotion() || !("IntersectionObserver" in window) || !belowFold(el)) return;
    let frame = 0;
    const final = () => {
      cancelAnimationFrame(frame);
      io?.disconnect();
      near?.disconnect();
      node.nodeValue = el.dataset.final ?? node.nodeValue;
    };
    const run = () => {
      node.nodeValue = formatValue(0, kind);
      const start = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, Math.max(0, t - start) / 1400);
        node.nodeValue = k === 1 ? (el.dataset.final ?? "") : formatValue(value * (1 - Math.pow(1 - k, 3)), kind);
        if (k < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };
    let io: IntersectionObserver | null = null;
    let near: IntersectionObserver | null = null;
    const disarm = onFirstScroll(() => {
      // approaching: show 0; seen: count up where it can be watched
      near = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          near?.disconnect();
          if (!frame) node.nodeValue = formatValue(0, kind);
        }
      }, { rootMargin: NEAR });
      io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io?.disconnect();
          near?.disconnect();
          run();
        }
      }, { rootMargin: SEEN });
      near.observe(el);
      io.observe(el);
      return () => {
        near?.disconnect();
        io?.disconnect();
      };
    });
    window.addEventListener("beforeprint", final);
    return () => {
      window.removeEventListener("beforeprint", final);
      disarm();
      final();
    };
  }, [value, kind]);
  const text = formatValue(value, kind);
  return (
    <>
      <span ref={ref} aria-hidden="true" data-final={text}>
        {text}
      </span>
      <span className={styles.srOnly}>{text}</span>
    </>
  );
}

export function Cover({ src, className }: { src: string | null; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <span className={`${styles.coverEmpty} ${className ?? ""}`} aria-hidden="true" />;
  // Meta's CDN picture as it is (no Next image optimisation of a third-party URL)
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={src} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} />;
}
