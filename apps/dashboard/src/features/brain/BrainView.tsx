"use client";

import { AlertTriangle, CircleHelp, LocateFixed, Pause, Play, RotateCcw, RotateCw, Search, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { useDismissibleTooltips } from "@/lib/hooks/useDismissibleTooltips";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";
import { useBrain } from "./BrainProvider";
import { clusterColors, drawBrain, TYPE_STYLE, UNCLUSTERED_COLOR } from "./draw";
import { focusSet, matchesFilter } from "./focus";
import { clampCamera, DEFAULT_CAMERA, hitTest, type Camera, type HitTarget } from "./projection";
import { BRAIN_FAILURE_STATE, neighbours, NODE_TYPES, type BrainFailure, type BrainNode, type BrainProjection } from "./types";
import styles from "./brain.module.css";

const AUTO_ROTATE_SPEED = 0.0022;
const CLICK_SLOP = 4;

/** Shortest-path yaw that brings a node to the front. */
function focusYaw(node: BrainNode, current: number): number {
  const target = Math.atan2(node.position.x, node.position.z);
  const delta = ((target - current + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return current + delta;
}

function formatStamp(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date)} UTC`;
}

/** The Brain route: always the live projection from the dashboard server, or an honest state — never example data. */
export function BrainView({ initialNode }: { initialNode?: string }) {
  const { t } = useI18n();
  const { state, load } = useBrain();

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className={styles.page}>
      <PageHeader title={t("brain.title")} subtitle={t("brain.subtitle")} />
      {state.phase === "ready" ? (
        <>
          <StatusLine projection={state.projection} />
          {state.projection.nodes.length === 0 ? (
            <p className={`glass ${styles.empty}`} data-testid="brain-empty">
              {t("brain.empty")}
            </p>
          ) : (
            <BrainGraph projection={state.projection} initialNode={initialNode} />
          )}
        </>
      ) : state.phase === "failed" ? (
        <BrainFailureNotice failure={state.failure} onRetry={load} />
      ) : (
        <p className={styles.loading} role="status" data-testid="brain-loading">
          {t("brain.loading")}
        </p>
      )}
    </div>
  );
}

function StatusLine({ projection }: { projection: BrainProjection }) {
  const { t, locale } = useI18n();
  return (
    <p className={styles.statusLine} data-testid="brain-status" data-nodes={projection.nodes.length} data-edges={projection.edges.length}>
      {t("brain.statusLine", {
        nodes: projection.nodes.length,
        edges: projection.edges.length,
        clusters: projection.clusters.length,
        model: projection.embed_model,
        time: formatStamp(projection.generated_at, locale),
      })}
    </p>
  );
}

function BrainFailureNotice({ failure, onRetry }: { failure: BrainFailure; onRetry: () => void }) {
  const { t } = useI18n();
  const state = BRAIN_FAILURE_STATE[failure.kind];
  const Icon = state === "BLOCKED" ? AlertTriangle : CircleHelp;
  return (
    <div className={styles.failure} role="alert" data-state={state} data-kind={failure.kind} data-testid="brain-error">
      <span className={styles.stateLabel}>
        <Icon size={14} aria-hidden="true" strokeWidth={2.2} />
        {state}
      </span>
      <div className={styles.failureBody}>
        <p>{t(`brain.failures.${failure.kind}`)}</p>
        {failure.detail ? <p className={styles.failureDetail}>{failure.detail}</p> : null}
      </div>
      <button type="button" className={styles.linkButton} onClick={onRetry}>
        {t("brain.retry")}
      </button>
    </div>
  );
}

function BrainGraph({ projection, initialNode }: { projection: BrainProjection; initialNode?: string }) {
  const { t, locale } = useI18n();
  const reduced = useReducedMotion();
  const { nodes, edges, clusters } = projection;
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const colors = useMemo(() => clusterColors(clusters), [clusters]);
  const clusterLabel = useMemo(() => new Map(clusters.map((c) => [c.id, c.label])), [clusters]);
  const valid = initialNode && byId.has(initialNode) ? initialNode : null;
  const [selected, setSelected] = useState<string | null>(valid);
  const [autoRotate, setAutoRotate] = useState<boolean | null>(null);
  const [filter, setFilter] = useState("");
  const [clusterFocus, setClusterFocus] = useState<string | null>(null);
  const rotating = (autoRotate ?? !reduced) && selected === null;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<HTMLElement>(null);
  useDismissibleTooltips(toolbar);
  // a node passed in (e.g. from search) starts already focused
  const [initialCamera] = useState<Camera>(() =>
    valid ? clampCamera({ yaw: focusYaw(byId.get(valid)!, DEFAULT_CAMERA.yaw), pitch: -0.2, zoom: 1.2 }) : { ...DEFAULT_CAMERA },
  );
  const camera = useRef<Camera>(initialCamera);
  const target = useRef<Camera | null>(null);
  const targets = useRef<HitTarget[]>([]);
  const hovered = useRef<string | null>(null);
  const drag = useRef<{ x: number; y: number; moved: number; id: number } | null>(null);

  const typeName = useCallback((n: BrainNode) => t(`brain.types.${n.type}`), [t]);
  const focus = useMemo(
    () => focusSet({ nodes, edges, clusters, filter, cluster: clusterFocus, selected, typeName }),
    [nodes, edges, clusters, filter, clusterFocus, selected, typeName],
  );
  const related = useMemo(() => new Set(selected ? neighbours(edges, selected) : []), [edges, selected]);

  const live = useRef({ selected, rotating, reduced, related, focus, nodes, edges, colors });
  useEffect(() => {
    live.current = { selected, rotating, reduced, related, focus, nodes, edges, colors };
  });

  // a new selection starts at the top of the details card (stable element keeps the live region intact)
  useEffect(() => {
    selectionRef.current?.scrollTo({ top: 0 });
  }, [selected]);

  // keep the selected note visible in the list (canvas clicks and links can select off-screen items)
  useEffect(() => {
    if (selected) document.querySelector(`[data-testid="brain-node-${CSS.escape(selected)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const node = selected ? byId.get(selected) ?? null : null;

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
      const n = byId.get(id);
      if (n) steer({ yaw: focusYaw(n, (target.current ?? camera.current).yaw), pitch: -0.2, zoom: Math.max(1.2, camera.current.zoom) });
    },
    [steer, byId],
  );

  // render loop: draws from refs every frame, animates camera easing
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let frame = 0;
    let idleFrames = 0;
    let lastFocus: unknown = undefined;
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
      const { selected: sel, rotating: spin, related: rel, focus: bright, nodes: ns, edges: es, colors: cs } = live.current;
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
        nodes: ns,
        edges: es,
        colors: cs,
        camera: camera.current,
        // while the details card is open, centre the graph in the free area to its left
        viewport: { width: canvas.clientWidth - (sel && selectionRef.current && !selectionRef.current.hidden ? selectionRef.current.offsetWidth + 24 : 0), height: canvas.clientHeight },
        selected: sel,
        hovered: hovered.current,
        related: rel,
        focus: bright,
        labelOf: (n) => n.title,
      });

      // publish camera, focus and idle node positions for automated checks (positions only when still)
      idleFrames = moving ? 0 : idleFrames + 1;
      canvas.dataset.yaw = camera.current.yaw.toFixed(3);
      canvas.dataset.zoom = camera.current.zoom.toFixed(3);
      canvas.dataset.idle = idleFrames > 2 ? "true" : "false";
      if (bright !== lastFocus) {
        lastFocus = bright;
        canvas.dataset.bright = bright ? JSON.stringify([...bright].sort()) : "all";
        canvas.dataset.dimmed = String(bright ? ns.filter((n) => !bright.has(n.id)).length : 0);
      }
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

  const visible = nodes.filter(
    (n) => matchesFilter(n, filter, typeName(n), clusterLabel.get(n.cluster) ?? "") && (clusterFocus === null || n.cluster === clusterFocus),
  );
  const relations: { dir: "in" | "out"; type: string; other: string }[] = node
    ? edges.flatMap<{ dir: "in" | "out"; type: string; other: string }>((e) => (e.from === node.id ? [{ dir: "out" as const, type: e.type, other: e.to }] : e.to === node.id ? [{ dir: "in" as const, type: e.type, other: e.from }] : []))
    : [];
  const titleOf = (id: string) => byId.get(id)?.title ?? id;
  const usedTypes = NODE_TYPES.filter((type) => nodes.some((n) => n.type === type));

  return (
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
        <p className="visually-hidden" aria-live="polite">
          {node ? `${t("brain.selected")}: ${node.title}` : ""}
        </p>
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
            aria-label={t("brain.reset")}
            data-label={t("brain.reset")}
          >
            <LocateFixed size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.control}
            aria-pressed={rotating}
            onClick={() => {
              // turning rotation on releases the focused node, otherwise the toggle would appear dead
              if (!rotating) setSelected(null);
              setAutoRotate(!rotating);
            }}
            aria-label={t("brain.autoRotate")}
            data-label={t("brain.autoRotate")}
            data-testid="brain-auto-rotate"
          >
            {rotating ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          </button>
        </div>
        <ul className={styles.legend} aria-label={t("brain.typesLabel")} data-testid="brain-legend-types">
          {usedTypes.map((type) => (
            <li key={type} className={styles.legendItem}>
              <span className={styles.swatch} data-shape={TYPE_STYLE[type].shape} aria-hidden="true" />
              {t(`brain.types.${type}`)}
            </li>
          ))}
        </ul>
        <section ref={selectionRef} className={`glass ${styles.card} ${styles.selection}`} hidden={!node} data-testid="brain-selection">
          <h2 className={styles.cardLabel}>{t("brain.selected")}</h2>
          {node ? (
            <>
              <p className={styles.nodeTitle} data-testid="brain-selected-title" data-superseded={node.status === "SUPERSEDED" ? "true" : undefined}>
                {node.title}
              </p>
              <dl className={styles.facts}>
                <div>
                  <dt>{t("brain.type")}</dt>
                  <dd>
                    <span className={styles.swatch} data-shape={TYPE_STYLE[node.type].shape} aria-hidden="true" /> {t(`brain.types.${node.type}`)}
                  </dd>
                </div>
                <div>
                  <dt>{t("brain.status")}</dt>
                  <dd>
                    <span className={styles.statusChip} data-status={node.status} data-testid="brain-selected-status">
                      {node.status}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>{t("brain.cluster")}</dt>
                  <dd>
                    <span className={styles.dot} style={{ color: colors.get(node.cluster) ?? UNCLUSTERED_COLOR }} aria-hidden="true" /> {clusterLabel.get(node.cluster) ?? node.cluster}
                  </dd>
                </div>
                <div>
                  <dt>{t("brain.createdBy")}</dt>
                  <dd data-testid="brain-selected-created-by">{node.created_by}</dd>
                </div>
                <div>
                  <dt>{t("brain.updated")}</dt>
                  <dd>{formatStamp(node.updated, locale)}</dd>
                </div>
              </dl>
              {node.status === "SUPERSEDED" ? <p className={styles.supersededHint}>{t("brain.supersededHint")}</p> : null}
              {node.summary ? <p className={styles.summary}>{node.summary}</p> : null}
              {node.topics.length + node.workshops.length > 0 ? (
                <dl className={styles.facts}>
                  {node.topics.length > 0 ? (
                    <div>
                      <dt>{t("brain.topics")}</dt>
                      <dd>{node.topics.map(titleOf).join(", ")}</dd>
                    </div>
                  ) : null}
                  {node.workshops.length > 0 ? (
                    <div>
                      <dt>{t("brain.workshops")}</dt>
                      <dd>{node.workshops.map(titleOf).join(", ")}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
              {node.source ? (
                <>
                  <h3 className={styles.cardLabel}>{t("brain.sourceDetails")}</h3>
                  <dl className={styles.facts} data-testid="brain-source-details">
                    <div>
                      <dt>{t("brain.kind")}</dt>
                      <dd>{node.source.kind}</dd>
                    </div>
                    <div>
                      <dt>{t("brain.access")}</dt>
                      <dd>{node.source.access}</dd>
                    </div>
                    <div>
                      <dt>{t("brain.dataClass")}</dt>
                      <dd>{node.source.data_class}</dd>
                    </div>
                    <div>
                      <dt>{t("brain.locator")}</dt>
                      <dd>{node.source.locator_display}</dd>
                    </div>
                  </dl>
                </>
              ) : null}
              <h3 className={styles.cardLabel}>{t("brain.sources")}</h3>
              {node.source_refs.length > 0 ? (
                <ul className={styles.refs} data-testid="brain-source-refs">
                  {node.source_refs.map((ref) => {
                    const src = byId.get(ref.source);
                    return (
                      <li key={`${ref.source}#${ref.locator}`}>
                        {src ? (
                          <button type="button" className={styles.linkButton} onClick={() => select(src.id)}>
                            {src.title}
                          </button>
                        ) : (
                          <span className={styles.mono}>{ref.source}</span>
                        )}{" "}
                        <span className={styles.locator}>{ref.locator}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className={styles.summary}>{t("brain.noSources")}</p>
              )}
              <h3 className={styles.cardLabel}>{t("brain.connections")}</h3>
              {relations.length > 0 ? (
                <ul className={styles.refs} data-testid="brain-relations">
                  {relations.map((r) => (
                    <li key={`${r.dir}-${r.type}-${r.other}`}>
                      <span className={styles.relationType}>{r.dir === "out" ? `${r.type} →` : `← ${r.type}`}</span>{" "}
                      <button type="button" className={styles.linkButton} onClick={() => select(r.other)}>
                        {titleOf(r.other)}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.summary}>{t("brain.noRelations")}</p>
              )}
            </>
          ) : (
            <p className={styles.summary}>{t("brain.noneSelected")}</p>
          )}
        </section>
      </div>

      <aside className={styles.side}>
        <section className={`glass ${styles.card} ${styles.clusterCard}`}>
          <h2 className={styles.cardLabel}>{t("brain.clusters")}</h2>
          <ul className={styles.clusterList}>
            {clusters.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={styles.clusterItem}
                  aria-pressed={clusterFocus === c.id}
                  title={t("brain.focusCluster", { label: c.label })}
                  onClick={() => setClusterFocus(clusterFocus === c.id ? null : c.id)}
                  data-testid={`brain-legend-cluster-${c.id}`}
                >
                  <span className={styles.dot} style={{ color: colors.get(c.id) }} aria-hidden="true" />
                  <span className={styles.listLabel}>{c.label}</span>
                  <span className={styles.listType}>{nodes.filter((n) => n.cluster === c.id).length}</span>
                </button>
              </li>
            ))}
          </ul>
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
                <button
                  type="button"
                  className={styles.listItem}
                  aria-pressed={selected === n.id}
                  onClick={() => select(n.id)}
                  data-testid={`brain-node-${n.id}`}
                  data-status={n.status}
                >
                  <span className={styles.swatch} data-shape={TYPE_STYLE[n.type].shape} style={{ color: colors.get(n.cluster) ?? UNCLUSTERED_COLOR }} aria-hidden="true" />
                  <span className={styles.listLabel}>{n.title}</span>
                  <span className={styles.listType}>{t(`brain.types.${n.type}`)}</span>
                </button>
              </li>
            ))}
            {visible.length === 0 ? <li className={styles.summary}>{t("brain.noMatch")}</li> : null}
          </ul>
        </section>
      </aside>
    </div>
  );
}
