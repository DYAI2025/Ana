"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { useToast } from "@/components/providers/ToastProvider";
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
  | { phase: "pending"; requestId: string; summary: string; everUnknown: boolean }
  /** `everUnknown`: some attempt for this request got no answer — the item may exist in Jira until Jira says otherwise. */
  | { phase: "failed"; requestId: string; summary: string; failure: WorkFailure; everUnknown: boolean }
  /** The item exists in Jira; `problem` carries a readback mismatch (ERROR) when it is not exactly what was asked. */
  | { phase: "created"; requestId: string; issue: WorkIssue; replayed: boolean; problem?: WorkFailure };

/**
 * An idea Jira has not resolved: its text cannot change and it cannot be dropped. Once any attempt went unanswered
 * the request stays locked until Jira shows the item (created) — a later error from a different step (for example a
 * board read) does not prove the earlier create never happened.
 */
export function ideaLocked(idea: IdeaSubmission | null): idea is Extract<IdeaSubmission, { phase: "pending" | "failed" }> {
  if (idea === null || idea.phase === "created") return false;
  return idea.phase === "pending" || idea.failure.state === "UNKNOWN" || idea.everUnknown;
}

export interface MoveNotice {
  key: string;
  failure: WorkFailure;
}

interface WorkValue {
  state: WorkState;
  refreshing: boolean;
  /** Moves sent to Jira and not yet confirmed, by issue key. */
  pending: Readonly<Record<string, PendingMove>>;
  /** Refused or unconfirmed moves, one per issue, newest first; kept here so leaving the Board cannot lose them. */
  moveNotices: readonly MoveNotice[];
  dismissMoveNotice: (key: string) => void;
  /** Issues whose last move got no readback: shown as "not confirmed" until a Jira read includes them again. */
  unconfirmed: ReadonlySet<string>;
  /** The Board announces that it is on screen; a failed move is then reported there, not by an extra toast. */
  registerBoard: () => () => void;
  idea: IdeaSubmission | null;
  refresh: (reconcileIssueIds?: readonly string[]) => Promise<void>;
  move: (issue: WorkIssue, from: WorkColumn, to: WorkColumn) => Promise<WriteResult>;
  createIdea: (requestId: string, summary: string, options?: { confirmRecreate?: boolean }) => Promise<WriteResult>;
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
  const [moveNotices, setMoveNotices] = useState<MoveNotice[]>([]);
  const [unconfirmed, setUnconfirmed] = useState<ReadonlySet<string>>(() => new Set());
  const { t } = useI18n();
  const { notify } = useToast();
  const stateRef = useRef(state);
  const pendingRef = useRef(pending);
  const ideaRef = useRef(idea);
  const readSeq = useRef(0);
  const writeSeq = useRef(0);
  const written = useRef(new Map<string, Written>());
  /** Issues written from this tab (even when no readback came back), by Jira issue id, with the write time. */
  const touched = useRef(new Map<string, number>());
  const boardsOnScreen = useRef(0);

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
    // newest first: when more than 50 issues were touched, the most recent writes are the ones reconciled
    const recent = [...touched.current.entries()]
      .filter(([, at]) => now - at < RECONCILE_WINDOW_MS)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
    const result = await fetchSnapshot([...new Set([...reconcileIssueIds, ...recent])].slice(0, 50));
    if (seq !== readSeq.current) return; // a newer read superseded this one
    setRefreshing(false);
    // a successful Jira read shows every issue as Jira has it now: nothing is "not confirmed" any more
    if (result.ok) setUnconfirmed((current) => (current.size === 0 ? current : new Set()));
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
    touched.current.set(issue.id, Date.now());
    setState((current) => (current.phase === "ready" || current.phase === "stale" ? { ...current, snapshot: withIssue(current.snapshot, issue) } : current));
  }, []);

  const move = useCallback(
    async (issue: WorkIssue, from: WorkColumn, to: WorkColumn): Promise<WriteResult> => {
      if (stateRef.current.phase !== "ready" || pendingRef.current[issue.key]) return notReady;
      setPending((current) => ({ ...current, [issue.key]: { fromColumnId: from.id, toColumnId: to.id } }));
      setMoveNotices((current) => current.filter((notice) => notice.key !== issue.key));
      touched.current.set(issue.id, Date.now()); // reconciled by later reads even if no readback comes back
      const result = await postMove(issue.key, { fromStatusId: issue.status.id, toStatusIds: to.statuses.map((status) => status.id) });
      applyTruth(result.ok ? result.issue : result.failure.issue);
      setUnconfirmed((current) => {
        const next = new Set(current);
        if (!result.ok && !result.failure.issue) next.add(issue.key);
        else next.delete(issue.key);
        return next;
      });
      if (!result.ok) {
        setMoveNotices((current) => [{ key: issue.key, failure: result.failure }, ...current.filter((notice) => notice.key !== issue.key)]);
        // the notice stays on the Board; if the person has left it, the failure is announced where they are
        if (boardsOnScreen.current === 0) notify(t("board.moveNotConfirmed", { key: issue.key, state: result.failure.state }));
      }
      setPending((current) => {
        const next = { ...current };
        delete next[issue.key];
        return next;
      });
      // after any failed write the whole board is re-read, so nothing optimistic survives
      if (!result.ok) void refresh();
      return result;
    },
    [applyTruth, refresh, notify, t],
  );

  const createIdea = useCallback(
    async (requestId: string, summary: string, options: { confirmRecreate?: boolean } = {}): Promise<WriteResult> => {
      if (stateRef.current.phase !== "ready") return notReady;
      const before = ideaRef.current;
      if (before?.phase === "pending") return { ok: false, failure: { state: "UNKNOWN", code: "duplicate-in-flight", requestId: before.requestId } };
      const everUnknown = before !== null && before.phase !== "created" && before.requestId === requestId && before.everUnknown;
      setIdea({ phase: "pending", requestId, summary, everUnknown });
      const result = await postIdea({ requestId, summary, ...(options.confirmRecreate ? { confirmRecreate: true } : {}) });
      const truth = result.ok ? result.issue : result.failure.issue;
      applyTruth(truth);
      if (result.ok) setIdea({ phase: "created", requestId, issue: result.issue, replayed: Boolean(result.replayed) });
      // the item exists but is not exactly what was asked: resolved, shown with its ERROR
      else if (result.failure.code === "readback-mismatch" && truth) setIdea({ phase: "created", requestId, issue: truth, replayed: false, problem: result.failure });
      // Jira named an item for this request that no longer exists: resolved (ERROR), nothing is waiting any more
      else if (result.failure.code === "readback-mismatch") setIdea({ phase: "failed", requestId, summary, failure: result.failure, everUnknown: false });
      // the server may answer with an earlier, still unresolved request for the same idea: continue with that one
      else {
        // only outcomes where a create may have reached Jira lock the idea; a failed read before any create does not
        const createMaybeSent = result.failure.code === "write-unconfirmed" || result.failure.code === "duplicate-in-flight";
        const adopted = result.failure.requestId ?? requestId;
        setIdea({ phase: "failed", requestId: adopted, summary, failure: result.failure, everUnknown: everUnknown || createMaybeSent || adopted !== requestId });
      }
      // read-after-write: Jira reconciles the new issue into the board search
      void refresh(truth ? [truth.id] : []);
      return result;
    },
    [applyTruth, refresh],
  );

  const clearIdea = useCallback(() => setIdea((current) => (ideaLocked(current) ? current : null)), []);
  const dismissMoveNotice = useCallback((key: string) => setMoveNotices((current) => current.filter((notice) => notice.key !== key)), []);
  const registerBoard = useCallback(() => {
    boardsOnScreen.current += 1;
    return () => {
      boardsOnScreen.current -= 1;
    };
  }, []);

  // every page load reads Jira again; a returning network connection does too
  useEffect(() => {
    void read([]);
    const onOnline = () => void refresh();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [read, refresh]);

  const value = useMemo<WorkValue>(
    () => ({ state, refreshing, pending, moveNotices, dismissMoveNotice, unconfirmed, registerBoard, idea, refresh, move, createIdea, clearIdea }),
    [state, refreshing, pending, moveNotices, dismissMoveNotice, unconfirmed, registerBoard, idea, refresh, move, createIdea, clearIdea],
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
