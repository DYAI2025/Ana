"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fetchSnapshot, postIdea, postMove } from "./api";
import { withIssue } from "./model";
import type { WorkColumn, WorkFailure, WorkIssue, WorkSnapshot, WriteResult } from "./types";

/**
 * The browser's view of Jira work. Everything here is disposable view state: it lives in memory, is rebuilt from
 * Jira on every load and reconnect, and is never written to storage. Jira stays the only work store.
 */
export type WorkState =
  | { phase: "loading" }
  | { phase: "ready"; snapshot: WorkSnapshot }
  /** A refresh failed after a good read: the last Jira read stays visible, clearly dated, and writes pause. */
  | { phase: "stale"; snapshot: WorkSnapshot; failure: WorkFailure }
  | { phase: "failed"; failure: WorkFailure };

export interface PendingMove {
  fromColumnId: string;
  toColumnId: string;
}

/**
 * The current Add idea submission. It lives here, not in the Backlog page, so leaving the page cannot lose an
 * unresolved request: an UNKNOWN outcome keeps its request id and text until Jira answers either way.
 */
export type IdeaSubmission =
  | { phase: "pending"; requestId: string; summary: string }
  | { phase: "failed"; requestId: string; summary: string; failure: WorkFailure }
  | { phase: "created"; issue: WorkIssue; replayed: boolean };

/** An idea whose outcome Jira has not confirmed: its text cannot change and it cannot be dropped. */
export function ideaLocked(idea: IdeaSubmission | null): idea is Extract<IdeaSubmission, { phase: "pending" | "failed" }> {
  return idea !== null && (idea.phase === "pending" || (idea.phase === "failed" && idea.failure.state === "UNKNOWN"));
}

interface WorkValue {
  state: WorkState;
  refreshing: boolean;
  /** Moves sent to Jira and not yet confirmed, by issue key. */
  pending: Readonly<Record<string, PendingMove>>;
  idea: IdeaSubmission | null;
  refresh: (reconcileIssueIds?: readonly string[]) => Promise<void>;
  move: (issue: WorkIssue, from: WorkColumn, to: WorkColumn) => Promise<WriteResult>;
  createIdea: (requestId: string, summary: string) => Promise<WriteResult>;
  /** Drops a finished or definitively refused submission; an unconfirmed one stays. */
  clearIdea: () => void;
}

const WorkContext = createContext<WorkValue | null>(null);

const notReady: WriteResult = { ok: false, failure: { state: "UNKNOWN", code: "stale", detail: "The board is not current; refresh from Jira first" } };
/** Issues written from this tab are reconciled by Jira in every read for this long (search is eventually consistent). */
const RECONCILE_WINDOW_MS = 10 * 60_000;

interface Written {
  issue: WorkIssue;
  seq: number;
  at: number;
}

export function WorkProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkState>({ phase: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<Record<string, PendingMove>>({});
  const [idea, setIdea] = useState<IdeaSubmission | null>(null);
  const stateRef = useRef(state);
  const pendingRef = useRef(pending);
  const ideaRef = useRef(idea);
  const readSeq = useRef(0);
  const writeSeq = useRef(0);
  const written = useRef(new Map<string, Written>());

  useEffect(() => {
    stateRef.current = state;
    pendingRef.current = pending;
    ideaRef.current = idea;
  }, [state, pending, idea]);

  // observable phase of the Jira read (tests and styling), e.g. <html data-work="ready">
  useEffect(() => {
    document.documentElement.dataset.work = state.phase;
  }, [state.phase]);

  /**
   * One Jira read; state changes only after the answer arrives. Issues written recently are reconciled by Jira,
   * and a write Jira confirmed after this read began is newer than the read, so it is laid over the result.
   */
  const read = useCallback(async (reconcileIssueIds: readonly string[]) => {
    const seq = ++readSeq.current;
    const writesBefore = writeSeq.current;
    const now = Date.now();
    const recent = [...written.current.values()].filter((w) => now - w.at < RECONCILE_WINDOW_MS).map((w) => w.issue.id);
    const result = await fetchSnapshot([...new Set([...reconcileIssueIds, ...recent])].slice(0, 50));
    if (seq !== readSeq.current) return; // a newer read superseded this one
    setRefreshing(false);
    setState((current) => {
      if (result.ok) {
        let snapshot = result.snapshot;
        for (const w of written.current.values()) if (w.seq > writesBefore) snapshot = withIssue(snapshot, w.issue);
        return { phase: "ready", snapshot };
      }
      if (current.phase === "ready" || current.phase === "stale") return { phase: "stale", snapshot: current.snapshot, failure: result.failure };
      return { phase: "failed", failure: result.failure };
    });
  }, []);

  const refresh = useCallback(
    async (reconcileIssueIds: readonly string[] = []) => {
      setRefreshing(true);
      await read(reconcileIssueIds);
    },
    [read],
  );

  /** Jira's confirmed truth for one issue (from a verified write or a failure's readback). */
  const applyTruth = useCallback((issue: WorkIssue | undefined) => {
    if (!issue) return;
    writeSeq.current += 1;
    written.current.set(issue.key, { issue, seq: writeSeq.current, at: Date.now() });
    setState((current) => (current.phase === "ready" || current.phase === "stale" ? { ...current, snapshot: withIssue(current.snapshot, issue) } : current));
  }, []);

  const move = useCallback(
    async (issue: WorkIssue, from: WorkColumn, to: WorkColumn): Promise<WriteResult> => {
      if (stateRef.current.phase !== "ready" || pendingRef.current[issue.key]) return notReady;
      setPending((current) => ({ ...current, [issue.key]: { fromColumnId: from.id, toColumnId: to.id } }));
      const result = await postMove(issue.key, { fromStatusId: issue.status.id, toStatusIds: to.statuses.map((status) => status.id) });
      applyTruth(result.ok ? result.issue : result.failure.issue);
      setPending((current) => {
        const next = { ...current };
        delete next[issue.key];
        return next;
      });
      // after any failed write the whole board is re-read, so nothing optimistic survives
      if (!result.ok) void refresh();
      return result;
    },
    [applyTruth, refresh],
  );

  const createIdea = useCallback(
    async (requestId: string, summary: string): Promise<WriteResult> => {
      if (stateRef.current.phase !== "ready") return notReady;
      if (ideaRef.current?.phase === "pending") return { ok: false, failure: { state: "UNKNOWN", code: "duplicate-in-flight", requestId: ideaRef.current.requestId } };
      setIdea({ phase: "pending", requestId, summary });
      const result = await postIdea({ requestId, summary });
      const truth = result.ok ? result.issue : result.failure.issue;
      applyTruth(truth);
      // the server may answer with an earlier, still unresolved request for the same idea: continue with that one
      if (result.ok) setIdea({ phase: "created", issue: result.issue, replayed: Boolean(result.replayed) });
      else setIdea({ phase: "failed", requestId: result.failure.requestId ?? requestId, summary, failure: result.failure });
      // read-after-write: Jira reconciles the new issue into the board search
      void refresh(truth ? [truth.id] : []);
      return result;
    },
    [applyTruth, refresh],
  );

  const clearIdea = useCallback(() => setIdea((current) => (ideaLocked(current) ? current : null)), []);

  // every page load reads Jira again; a returning network connection does too
  useEffect(() => {
    void read([]);
    const onOnline = () => void refresh();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [read, refresh]);

  const value = useMemo<WorkValue>(
    () => ({ state, refreshing, pending, idea, refresh, move, createIdea, clearIdea }),
    [state, refreshing, pending, idea, refresh, move, createIdea, clearIdea],
  );
  return <WorkContext.Provider value={value}>{children}</WorkContext.Provider>;
}

export function useWork(): WorkValue {
  const value = useContext(WorkContext);
  if (!value) throw new Error("useWork must be used inside <WorkProvider>");
  return value;
}

/** The snapshot to render, if any (the stale one stays visible but is marked). */
export function snapshotOf(state: WorkState): WorkSnapshot | null {
  return state.phase === "ready" || state.phase === "stale" ? state.snapshot : null;
}
