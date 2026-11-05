import "server-only";
import { PROJECTS } from "@/features/world/people";
import { jiraClientFromEnv, READ_BUDGET_MS } from "@/server/http";
import { readSnapshot } from "@/server/jira/work";
import { readSocialConfig } from "@/server/social/config";
import { socialServiceFromEnv } from "@/server/social/service";
import { readManual } from "./lookStore";
import { readHistory, recordHistory } from "./audienceHistory";
import { createWorldService, type WorldService } from "./service";
import { createVisionReader, visionConfigFromEnv } from "./vision";
import { createPostTagger } from "./tagger";
import { createTopicTagger } from "./topicTagger";
import { createNewsletterReader, type NewsletterReader } from "./newsletterReader";
import { createPostHistory } from "./postHistory";
import { createReelDaily } from "./reelDaily";
import { brainCaller, brainWriterConfigFromEnv, createBrainWriter } from "./brainWriter";
import { createBriefService, type BriefService } from "./briefService";

let shared: { key: string; service: WorldService; brief: BriefService | null } | null = null;
// the newsletter feeds are read on a clock too, not only when someone opens the world: a busy feed holds a few days
// kept on globalThis: a reloaded module (dev hot reload) must still stop the clock the earlier copy started. Only the
// clock is shared, not the reader: two live copies of this module would each keep their own reader.
const TIMER = Symbol.for("ana.world.newsletterTimer");
const timers = globalThis as typeof globalThis & { [TIMER]?: ReturnType<typeof setInterval> | null };
function setNewsletterTimer(next: ReturnType<typeof setInterval> | null) {
  if (timers[TIMER]) clearInterval(timers[TIMER]);
  timers[TIMER] = next;
}
const NEWSLETTER_TICK_MS = 3_600_000;

/** The process-wide world service; it shares the Instagram snapshot cache with the Social cockpit. */
export function worldServiceFromEnv(): WorldService {
  const config = readSocialConfig();
  const jiraConfigured = jiraClientFromEnv(READ_BUDGET_MS) !== null;
  const pulseRaw = Number(process.env.WORLD_PULSE_MS);
  const pulseMs = process.env.WORLD_PULSE_MS !== undefined && Number.isFinite(pulseRaw) && pulseRaw >= 0 ? pulseRaw : undefined;
  const vision = visionConfigFromEnv();
  const brain = brainWriterConfigFromEnv();
  const key = `${config?.workerOrigin ?? "-"}|${config?.key.length ?? 0}|${jiraConfigured}|${pulseMs ?? "d"}|${vision?.model ?? "-"}|${brain ? "brain" : "-"}`;
  if (!shared || shared.key !== key) {
    // popular Substack newsletters, RSS feeds only (Ben 2026-11-04: Substack's terms forbid crawling the site)
    const newsletters: NewsletterReader | null = vision ? createNewsletterReader(vision) : null;
    setNewsletterTimer(null);
    if (newsletters) {
      const timer = setInterval(() => newsletters.schedule(), NEWSLETTER_TICK_MS);
      timer.unref?.();
      setNewsletterTimer(timer);
    }
    // the brief: same model key; the weekly one goes into the Brain with the agent key
    const brief = vision ? createBriefService({ config: vision, readHistory: () => readHistory(), brain: brain ? brainCaller(brain) : null }) : null;
    shared = {
      key,
      brief,
      service: createWorldService({
        social: socialServiceFromEnv(),
        socialConfig: config,
        readWork: jiraConfigured
          ? async () => {
              const client = jiraClientFromEnv(READ_BUDGET_MS);
              if (!client) return { ok: false, failure: { code: "not-configured" } };
              return readSnapshot(client);
            }
          : null,
        workKeys: PROJECTS.flatMap((p) => p.jiraKeys),
        // WORLD_PULSE_MS shortens the pulse reuse window (e2e uses 0); the retry back-off shrinks with it
        timings: pulseMs === undefined ? undefined : { pulseMs, retryMs: Math.min(60_000, pulseMs) },
        readManual: () => readManual(),
        vision: vision ? createVisionReader(vision) : null,
        history: { read: () => readHistory(), record: (e) => recordHistory(e) },
        // same key and model as the look reader; Ana agreed to the categories on 2026-11-02
        tagger: vision ? createPostTagger(vision) : null,
        // the office topics: same model, same agreement (cover + caption in, only topic ids kept)
        topicTagger: vision ? createTopicTagger(vision) : null,
        newsletters,
        // Ana's last 200 posts for the office board (Ben, 2026-11-05): same worker and key as the snapshot
        postHistory: config ? createPostHistory(config) : null,
        reelDaily: createReelDaily(),
        // agent:lumen, Ben's approval of 2026-11-03: aggregated numbers only, never CONFIRMED
        brain: brain ? createBrainWriter(brain) : null,
        brief,
      }),
    };
  }
  return shared.service;
}

/** The brief of the process-wide world service (null without a model key). */
export function worldBriefFromEnv(): BriefService | null {
  worldServiceFromEnv();
  return shared?.brief ?? null;
}

/** e2e only: forget cached world reads (the route enables it only under SOCIAL_IG_E2E_CONTROLS=1). */
export function resetWorldService(): void {
  setNewsletterTimer(null);
  shared = null;
}
