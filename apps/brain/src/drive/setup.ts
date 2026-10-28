import { existsSync } from "node:fs";
import type { Config } from "../config.js";
import { DriveClient } from "./client.js";
import { DriveTokenProvider, loadServiceAccountKey } from "./oauth.js";

type DriveConfig = Pick<Config, "driveRootId" | "driveSaKeyFile">;

/**
 * A DriveClient when ANA_DRIVE_ROOT_ID is set; undefined (Drive disabled) when it is not. A root id without a
 * readable service-account key fails closed: Drive locators must never be registered unverified by accident.
 */
export function driveFromConfig(cfg: DriveConfig): DriveClient | undefined {
  if (!cfg.driveRootId) return undefined;
  if (!existsSync(cfg.driveSaKeyFile)) throw new Error(`ANA_DRIVE_ROOT_ID is set but the Drive service-account key ${cfg.driveSaKeyFile} does not exist`);
  return new DriveClient(new DriveTokenProvider(loadServiceAccountKey(cfg.driveSaKeyFile)), cfg.driveRootId);
}

export function requireDrive(cfg: DriveConfig): DriveClient {
  if (!cfg.driveRootId) throw new Error("ANA_DRIVE_ROOT_ID is not set; Drive access is disabled");
  return driveFromConfig(cfg)!;
}
