import "server-only";
import { PROJECTS } from "@/features/world/people";
import { jiraClientFromEnv, READ_BUDGET_MS } from "@/server/http";
import { readSnapshot } from "@/server/jira/work";
import { readSocialConfig } from "@/server/social/config";
import { socialServiceFromEnv } from "@/server/social/service";
import { createWorldService, type WorldService } from "./service";

let shared: { key: string; service: WorldService } | null = null;

/** The process-wide world service; it shares the Instagram snapshot cache with the Social cockpit. */
export function worldServiceFromEnv(): WorldService {
  const config = readSocialConfig();
  const jiraConfigured = jiraClientFromEnv(READ_BUDGET_MS) !== null;
  const key = `${config?.workerOrigin ?? "-"}|${config?.key.length ?? 0}|${jiraConfigured}`;
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
      }),
    };
  }
  return shared.service;
}

/** e2e only: forget cached world reads (the route enables it only under SOCIAL_IG_E2E_CONTROLS=1). */
export function resetWorldService(): void {
  shared = null;
}
