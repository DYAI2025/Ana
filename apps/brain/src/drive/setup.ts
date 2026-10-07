import { existsSync } from "node:fs";
import type { Config } from "../config.js";
import { DriveClient } from "./client.js";
import { DriveTokenProvider, loadDriveCredentials } from "./oauth.js";

/** A DriveClient when ANA_DRIVE_ROOT_ID is set and the OAuth file exists; otherwise undefined (Drive disabled). */
export function driveFromConfig(cfg: Pick<Config, "driveRootId" | "driveOauthFile">): DriveClient | undefined {
  if (!cfg.driveRootId || !existsSync(cfg.driveOauthFile)) return undefined;
  return new DriveClient(new DriveTokenProvider(loadDriveCredentials(cfg.driveOauthFile)), cfg.driveRootId);
}

export function requireDrive(cfg: Pick<Config, "driveRootId" | "driveOauthFile">): DriveClient {
  if (!cfg.driveRootId) throw new Error("ANA_DRIVE_ROOT_ID is not set; Drive access is disabled");
  const d = driveFromConfig(cfg);
  if (!d) throw new Error(`Drive OAuth file not found: ${cfg.driveOauthFile} (run drive-auth)`);
  return d;
}
