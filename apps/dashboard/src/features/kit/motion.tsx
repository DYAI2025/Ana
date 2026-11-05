"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatValue } from "./format";
import type { KitValueKind } from "./model";
import styles from "./kit.module.css";

/**
 * The media kit's only client parts (ANA-53): sections that rise in, numbers that count up, covers that fall back when
 * Meta's CDN link fails. The page itself renders on the server, so only these props travel to the browser.
 * With reduced motion (or without JavaScript) everything is simply there with its final numbers; printing a page
 * (or saving it as PDF) shows every number and section in full, scrolled to or not.
 */

const reducedMotion = () => typeof window === "undefined" || !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const belowFold = (el: Element) => el.getBoundingClientRect().top > window.innerHeight * 0.92;

export function Reveal({ children, className, as: Tag = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" } & Partial<Record<`data-${string}` | "aria-labelledby" | "id", string>>) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || !("IntersectionObserver" in window) || !belowFold(el)) return;
    el.dataset.reveal = "wait";
    const show = () => {
      el.dataset.reveal = "in";
      io.disconnect();
    };
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && show(), { rootMargin: "0px 0px -8% 0px" });
    io.observe(el);
    window.addEventListener("beforeprint", show);
    return () => {
      io.disconnect();
      window.removeEventListener("beforeprint", show);
    };
  }, []);
  return (
    <Tag ref={ref as never} className={`${styles.reveal} ${className ?? ""}`} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * A number that counts up from 0 once it is seen. The server renders the final value; assistive technology reads a
 * separate copy of it. The animation writes the text node React rendered (never replaces it), and every way out —
 * printing, unmounting, a new value — puts back the final value from data-final, which React keeps current.
 */
export function CountUp({ value, kind }: { value: number; kind: KitValueKind }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    const node = el?.firstChild;
    if (!el || !node || node.nodeType !== Node.TEXT_NODE || reducedMotion() || !("IntersectionObserver" in window)) return;
    let frame = 0;
    const final = () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      node.nodeValue = el.dataset.final ?? node.nodeValue;
    };
    const run = () => {
      const start = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, Math.max(0, t - start) / 1400);
        node.nodeValue = k === 1 ? (el.dataset.final ?? "") : formatValue(value * (1 - Math.pow(1 - k, 3)), kind);
        if (k < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };
    node.nodeValue = formatValue(0, kind);
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        run();
      }
    });
    io.observe(el);
    window.addEventListener("beforeprint", final);
    return () => {
      window.removeEventListener("beforeprint", final);
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
