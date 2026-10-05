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

interface WorkValue {
  state: WorkState;
  refreshing: boolean;
  /** Moves sent to Jira and not yet confirmed, by issue key. */
  pending: Readonly<Record<string, PendingMove>>;
  refresh: (reconcileIssueIds?: readonly string[]) => Promise<void>;
  move: (issue: WorkIssue, from: WorkColumn, to: WorkColumn) => Promise<WriteResult>;
  createIdea: (requestId: string, summary: string) => Promise<WriteResult>;
}

const WorkContext = createContext<WorkValue | null>(null);

const notReady: WriteResult = { ok: false, failure: { state: "UNKNOWN", code: "stale", detail: "The board is not current; refresh from Jira first" } };

export function WorkProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkState>({ phase: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<Record<string, PendingMove>>({});
  const stateRef = useRef(state);
  const pendingRef = useRef(pending);
  const readSeq = useRef(0);

  useEffect(() => {
    stateRef.current = state;
    pendingRef.current = pending;
  }, [state, pending]);

  // observable phase of the Jira read (tests and styling), e.g. <html data-work="ready">
  useEffect(() => {
    document.documentElement.dataset.work = state.phase;
  }, [state.phase]);

  /** One Jira read; state changes only after the answer arrives. */
  const read = useCallback(async (reconcileIssueIds: readonly string[]) => {
    const seq = ++readSeq.current;
    const result = await fetchSnapshot(reconcileIssueIds);
    if (seq !== readSeq.current) return; // a newer read superseded this one
    setRefreshing(false);
    setState((current) => {
      if (result.ok) return { phase: "ready", snapshot: result.snapshot };
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

  const applyTruth = useCallback((issue: WorkIssue | undefined) => {
    if (!issue) return;
    // a read that started before this write may predate it: drop it rather than let it overwrite Jira's newer answer
    readSeq.current += 1;
    setRefreshing(false);
    setState((current) => (current.phase === "ready" ? { ...current, snapshot: withIssue(current.snapshot, issue) } : current));
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
      const result = await postIdea({ requestId, summary });
      const truth = result.ok ? result.issue : result.failure.issue;
      applyTruth(truth);
      // read-after-write: Jira reconciles the new issue into the board search
      void refresh(truth ? [truth.id] : []);
      return result;
    },
    [applyTruth, refresh],
  );

  // every page load reads Jira again; a returning network connection does too
  useEffect(() => {
    void read([]);
    const onOnline = () => void refresh();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [read, refresh]);

  const value = useMemo<WorkValue>(() => ({ state, refreshing, pending, refresh, move, createIdea }), [state, refreshing, pending, refresh, move, createIdea]);
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
