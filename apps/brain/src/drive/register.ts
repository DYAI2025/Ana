import { createHash } from "node:crypto";
import type { SourceBlock } from "../contract/schema.js";
import type { Frontmatter } from "../contract/schema.js";
import type { Vault } from "../vault/vault.js";
import { DriveError, isReadableMime, sourceKindFor, type DriveClient, type DriveFile } from "./client.js";

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * Resolve a Drive file (root guard applies) into source-record metadata. The content is read only to hash it;
 * it is never returned or persisted. No checksum when the file is not readable as text or is too large.
 */
export async function driveMetadata(drive: DriveClient, fileId: string): Promise<{ file: DriveFile; checksum?: string; retrieved_at: string }> {
  const file = await drive.get(fileId);
  let checksum: string | undefined;
  if (isReadableMime(file.mimeType)) {
    try {
      const r = await drive.readText(fileId);
      if (!r.truncated) checksum = `sha256:${createHash("sha256").update(r.text, "utf8").digest("hex")}`;
    } catch (e) {
      if (!(e instanceof DriveError) || e.code === "outside_root") throw e;
    }
  }
  return { file, checksum, retrieved_at: nowIso() };
}

/** Fill a drive_* source block from Drive (locator = file id). */
export async function fillDriveSource(drive: DriveClient, source: SourceBlock): Promise<SourceBlock> {
  const { file, checksum, retrieved_at } = await driveMetadata(drive, source.locator);
  const rest: SourceBlock = { ...source };
  delete rest.checksum;
  return { ...rest, locator: file.id, original_title: file.name.slice(0, 500) || source.original_title, retrieved_at, ...(checksum ? { checksum } : {}) };
}

export const driveDescription = (f: DriveFile): string =>
  `Google Drive file in the ANA Evidence Root. mime: ${f.mimeType}; size: ${f.size ?? "UNKNOWN"} bytes; Drive modifiedTime: ${f.modifiedTime ?? "UNKNOWN"}.`;

export interface RegisterDriveInput {
  fileId: string;
  id: string;
  title: string;
  data_class?: SourceBlock["data_class"];
  access?: SourceBlock["access"];
  topics?: string[];
  workshops?: string[];
}

/** Register a Drive file as a source record (metadata only, never content). */
export async function registerDriveSource(vault: Vault, drive: DriveClient, actor: string, input: RegisterDriveInput): Promise<Frontmatter> {
  const { file, checksum, retrieved_at } = await driveMetadata(drive, input.fileId);
  return vault.registerSource(actor, {
    id: input.id,
    title: input.title,
    description: driveDescription(file),
    topics: input.topics,
    workshops: input.workshops,
    provenance_note: "registered from Google Drive (ANA Evidence Root)",
    source: {
      kind: sourceKindFor(file.mimeType), locator: file.id, original_title: file.name.slice(0, 500) || input.title,
      access: input.access ?? "restricted", data_class: input.data_class ?? "UNKNOWN", retrieved_at, ...(checksum ? { checksum } : {}),
    },
  });
}
