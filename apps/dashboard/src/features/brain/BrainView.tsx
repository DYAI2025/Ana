"use client";

import { Info, LocateFixed, Pause, Play, RotateCcw, RotateCw, Search, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/StatusChip";
import { BRAIN_EDGES, BRAIN_NODES, neighbours, NODE_TYPES, type BrainNode } from "@/fixtures/brain";
import { normalize } from "@/lib/search";
import { useDismissibleTooltips } from "@/lib/hooks/useDismissibleTooltips";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";
import { drawBrain, TYPE_STYLE } from "./draw";
import { clampCamera, DEFAULT_CAMERA, hitTest, type Camera, type HitTarget } from "./projection";
import styles from "./brain.module.css";

const AUTO_ROTATE_SPEED = 0.0022;
const CLICK_SLOP = 4;

/** Shortest-path yaw that brings a node to the front. */
function focusYaw(node: BrainNode, current: number): number {
  const target = Math.atan2(node.position.x, node.position.z);
  const delta = ((target - current + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return current + delta;
}

function initialCamera(nodeId: string | null): Camera {
  const node = nodeId ? BRAIN_NODES.find((n) => n.id === nodeId) : undefined;
  return node ? clampCamera({ yaw: focusYaw(node, DEFAULT_CAMERA.yaw), pitch: -0.2, zoom: 1.2 }) : { ...DEFAULT_CAMERA };
}

export function BrainView({ initialNode }: { initialNode?: string }) {
  const { t, text } = useI18n();
  const reduced = useReducedMotion();
  const valid = initialNode && BRAIN_NODES.some((n) => n.id === initialNode) ? initialNode : null;
  const [selected, setSelected] = useState<string | null>(valid);
  const [autoRotate, setAutoRotate] = useState<boolean | null>(null);
  const [filter, setFilter] = useState("");
  const rotating = (autoRotate ?? !reduced) && selected === null;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  useDismissibleTooltips(toolbar);
  // a node passed in (e.g. from search) starts already focused
  const camera = useRef<Camera>(initialCamera(valid));
  const target = useRef<Camera | null>(null);
  const targets = useRef<HitTarget[]>([]);
  const hovered = useRef<string | null>(null);
  const drag = useRef<{ x: number; y: number; moved: number; id: number } | null>(null);
  const live = useRef({ selected, rotating, reduced, text });
  useEffect(() => {
    live.current = { selected, rotating, reduced, text };
  });

  // keep the selected concept visible in the list (canvas clicks and links can select off-screen items)
  useEffect(() => {
    if (selected) document.querySelector(`[data-testid="brain-node-${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const node = selected ? BRAIN_NODES.find((n) => n.id === selected) ?? null : null;
  const related = useMemo(() => new Set(selected ? neighbours(selected) : []), [selected]);
  const relatedRef = useRef(related);
  useEffect(() => {
    relatedRef.current = related;
  }, [related]);

  const steer = useCallback((next: Partial<Camera>) => {
    const base = target.current ?? camera.current;
    const goal = clampCamera({ ...base, ...next });
    if (live.current.reduced) {
      camera.current = goal;
      target.current = null;
    } else {
      target.current = goal;
    }
  }, []);

  const select = useCallback(
    (id: string | null) => {
      setSelected(id);
      if (!id) return;
      const n = BRAIN_NODES.find((x) => x.id === id);
      if (n) steer({ yaw: focusYaw(n, (target.current ?? camera.current).yaw), pitch: -0.2, zoom: Math.max(1.2, camera.current.zoom) });
    },
    [steer],
  );

  // render loop: draws from refs every frame (20 nodes — cheap), animates camera easing
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let frame = 0;
    let idleFrames = 0;
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * ratio);
      canvas.height = Math.round(canvas.clientHeight * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    // moving the window to a screen with another pixel density re-sizes the backing store
    let dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const onDpr = () => {
      resize();
      dprQuery.removeEventListener("change", onDpr);
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      dprQuery.addEventListener("change", onDpr);
    };
    dprQuery.addEventListener("change", onDpr);

    const tick = () => {
      const { selected: sel, rotating: spin, text: label } = live.current;
      const cam = camera.current;
      let moving = false;
      if (target.current) {
        const goal = target.current;
        const ease = 0.12;
        cam.yaw += (goal.yaw - cam.yaw) * ease;
        cam.pitch += (goal.pitch - cam.pitch) * ease;
        cam.zoom += (goal.zoom - cam.zoom) * ease;
        moving = true;
        if (Math.abs(goal.yaw - cam.yaw) < 0.001 && Math.abs(goal.pitch - cam.pitch) < 0.001 && Math.abs(goal.zoom - cam.zoom) < 0.001) {
          camera.current = { ...goal };
          target.current = null;
        }
      } else if (spin && !drag.current) {
        cam.yaw += AUTO_ROTATE_SPEED;
        moving = true;
      }
      if (drag.current) moving = true;

      targets.current = drawBrain(ctx, {
        nodes: BRAIN_NODES,
        edges: BRAIN_EDGES,
        camera: camera.current,
        viewport: { width: canvas.clientWidth, height: canvas.clientHeight },
        selected: sel,
        hovered: hovered.current,
        related: relatedRef.current,
        labelOf: (n) => label(n.label),
      });

      // publish camera + idle node positions for automated checks (positions only when still)
      idleFrames = moving ? 0 : idleFrames + 1;
      canvas.dataset.yaw = camera.current.yaw.toFixed(3);
      canvas.dataset.zoom = camera.current.zoom.toFixed(3);
      canvas.dataset.idle = idleFrames > 2 ? "true" : "false";
      if (idleFrames === 3) canvas.dataset.hotspots = JSON.stringify(targets.current.map(({ id, x, y }) => ({ id, x: Math.round(x), y: Math.round(y) })));
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      dprQuery.removeEventListener("change", onDpr);
    };
  }, []);

  // wheel zoom needs a non-passive listener to stop page scroll
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const base = target.current ?? camera.current;
      steer({ zoom: base.zoom * Math.exp(-event.deltaY * 0.0015) });
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [steer]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, moved: 0, id: event.pointerId };
    target.current = null;
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (d && d.id === event.pointerId) {
      const dx = event.clientX - d.x;
      const dy = event.clientY - d.y;
      d.x = event.clientX;
      d.y = event.clientY;
      d.moved += Math.abs(dx) + Math.abs(dy);
      camera.current = clampCamera({ ...camera.current, yaw: camera.current.yaw + dx * 0.008, pitch: camera.current.pitch + dy * 0.006 });
      return;
    }
    const { x, y } = point(event);
    hovered.current = hitTest(targets.current, x, y);
    event.currentTarget.style.cursor = hovered.current ? "pointer" : "grab";
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved > CLICK_SLOP) return;
    const { x, y } = point(event);
    const hit = hitTest(targets.current, x, y);
    if (hit) select(hit);
  };

  const onCanvasKey = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const base = target.current ?? camera.current;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => steer({ yaw: base.yaw - 0.3 }),
      ArrowRight: () => steer({ yaw: base.yaw + 0.3 }),
      ArrowUp: () => steer({ pitch: base.pitch - 0.2 }),
      ArrowDown: () => steer({ pitch: base.pitch + 0.2 }),
      "+": () => steer({ zoom: base.zoom * 1.2 }),
      "=": () => steer({ zoom: base.zoom * 1.2 }),
      "-": () => steer({ zoom: base.zoom / 1.2 }),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    setAutoRotate(false);
    action();
  };

  const nudge = (kind: "left" | "right" | "in" | "out") => {
    setAutoRotate(false);
    const base = target.current ?? camera.current;
    steer(kind === "left" ? { yaw: base.yaw - 0.4 } : kind === "right" ? { yaw: base.yaw + 0.4 } : { zoom: base.zoom * (kind === "in" ? 1.25 : 1 / 1.25) });
  };

  const visible = BRAIN_NODES.filter((n) => normalize(text(n.label)).includes(normalize(filter)) || normalize(t(`brain.types.${n.type}`)).includes(normalize(filter)));

  return (
    <div className={styles.page}>
      <PageHeader title={t("brain.title")} subtitle={t("brain.subtitle")} />
      <p className={styles.banner} data-testid="brain-fixture-banner">
        <Info size={16} aria-hidden="true" />
        {t("brain.fixtureBanner")}
      </p>

      <div className={styles.layout}>
        <div className={`glass ${styles.stage}`}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            role="img"
            tabIndex={0}
            aria-label={t("brain.canvasLabel")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (drag.current = null)}
            onPointerLeave={() => (hovered.current = null)}
            onKeyDown={onCanvasKey}
            data-testid="brain-canvas"
          />
          <div ref={toolbar} className={styles.controls} role="toolbar" aria-label={t("brain.title")}>
            <button type="button" className={styles.control} onClick={() => nudge("left")} aria-label={t("brain.rotateLeft")} data-label={t("brain.rotateLeft")} data-testid="brain-rotate-left">
              <RotateCcw size={16} aria-hidden="true" />
            </button>
            <button type="button" className={styles.control} onClick={() => nudge("right")} aria-label={t("brain.rotateRight")} data-label={t("brain.rotateRight")} data-testid="brain-rotate-right">
              <RotateCw size={16} aria-hidden="true" />
            </button>
            <button type="button" className={styles.control} onClick={() => nudge("in")} aria-label={t("brain.zoomIn")} data-label={t("brain.zoomIn")} data-testid="brain-zoom-in">
              <ZoomIn size={16} aria-hidden="true" />
            </button>
            <button type="button" className={styles.control} onClick={() => nudge("out")} aria-label={t("brain.zoomOut")} data-label={t("brain.zoomOut")} data-testid="brain-zoom-out">
              <ZoomOut size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={styles.control}
              onClick={() => {
                setSelected(null);
                const base = target.current ?? camera.current;
                // shortest way back: never spin through every accumulated revolution
                const delta = ((((DEFAULT_CAMERA.yaw - base.yaw + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
                steer({ ...DEFAULT_CAMERA, yaw: base.yaw + delta });
              }}
              aria-label={t("brain.reset")} data-label={t("brain.reset")}
            >
              <LocateFixed size={16} aria-hidden="true" />
            </button>
            <button type="button" className={styles.control} aria-pressed={rotating} onClick={() => {
                // turning rotation on releases the focused node, otherwise the toggle would appear dead
                if (!rotating) setSelected(null);
                setAutoRotate(!rotating);
              }} aria-label={t("brain.autoRotate")} data-label={t("brain.autoRotate")} data-testid="brain-auto-rotate">
              {rotating ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
            </button>
          </div>
          <ul className={styles.legend} aria-label={t("brain.type")}>
            {NODE_TYPES.map((type) => (
              <li key={type} className={styles.legendItem}>
                <span className={styles.swatch} data-shape={TYPE_STYLE[type].shape} style={{ color: TYPE_STYLE[type].color }} aria-hidden="true" />
                {t(`brain.types.${type}`)}
              </li>
            ))}
          </ul>
        </div>

        <aside className={styles.side}>
          <section className={`glass ${styles.card}`} aria-live="polite" data-testid="brain-selection">
            <h2 className={styles.cardLabel}>{t("brain.selected")}</h2>
            {node ? (
              <>
                <p className={styles.nodeTitle} data-testid="brain-selected-title">
                  {text(node.label)}
                </p>
                <dl className={styles.facts}>
                  <div>
                    <dt>{t("brain.type")}</dt>
                    <dd>{t(`brain.types.${node.type}`)}</dd>
                  </div>
                  <div>
                    <dt>{t("brain.status")}</dt>
                    <dd>
                      <StatusChip tone="prototype">{t("brain.statusFixture")}</StatusChip>
                    </dd>
                  </div>
                </dl>
                <p className={styles.summary}>{text(node.summary)}</p>
                <h3 className={styles.cardLabel}>{t("brain.connections")}</h3>
                <ul className={styles.links}>
                  {[...related].map((id) => {
                    const other = BRAIN_NODES.find((n) => n.id === id)!;
                    return (
                      <li key={id}>
                        <button type="button" className={styles.linkButton} onClick={() => select(id)}>
                          {text(other.label)}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className={styles.summary}>{t("brain.noneSelected")}</p>
            )}
          </section>

          <section className={`glass ${styles.card} ${styles.listCard}`}>
            <h2 className={styles.cardLabel}>{t("brain.listLabel")}</h2>
            <label className={styles.filter}>
              <Search size={14} aria-hidden="true" />
              <span className="visually-hidden">{t("brain.filterPlaceholder")}</span>
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("brain.filterPlaceholder")} data-testid="brain-filter" />
            </label>
            <ul className={styles.list}>
              {visible.map((n) => (
                <li key={n.id}>
                  <button type="button" className={styles.listItem} aria-pressed={selected === n.id} onClick={() => select(n.id)} data-testid={`brain-node-${n.id}`}>
                    <span className={styles.swatch} data-shape={TYPE_STYLE[n.type].shape} style={{ color: TYPE_STYLE[n.type].color }} aria-hidden="true" />
                    <span className={styles.listLabel}>{text(n.label)}</span>
                    <span className={styles.listType}>{t(`brain.types.${n.type}`)}</span>
                  </button>
                </li>
              ))}
              {visible.length === 0 ? <li className={styles.summary}>{t("brain.noMatch")}</li> : null}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
