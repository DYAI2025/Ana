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

let shared: { key: string; service: WorldService } | null = null;

/** The process-wide world service; it shares the Instagram snapshot cache with the Social cockpit. */
export function worldServiceFromEnv(): WorldService {
  const config = readSocialConfig();
  const jiraConfigured = jiraClientFromEnv(READ_BUDGET_MS) !== null;
  const pulseRaw = Number(process.env.WORLD_PULSE_MS);
  const pulseMs = process.env.WORLD_PULSE_MS !== undefined && Number.isFinite(pulseRaw) && pulseRaw >= 0 ? pulseRaw : undefined;
  const vision = visionConfigFromEnv();
  const key = `${config?.workerOrigin ?? "-"}|${config?.key.length ?? 0}|${jiraConfigured}|${pulseMs ?? "d"}|${vision?.model ?? "-"}`;
  if (!shared || shared.key !== key) {
    shared = {
      key,
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
      }),
    };
  }
  return shared.service;
}

/** e2e only: forget cached world reads (the route enables it only under SOCIAL_IG_E2E_CONTROLS=1). */
export function resetWorldService(): void {
  shared = null;
}
