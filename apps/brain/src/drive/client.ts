import type { DriveTokenProvider } from "./oauth.js";

export const DRIVE_API = "https://www.googleapis.com/drive/v3";
export const OUTSIDE_ROOT = "outside ANA Evidence Root";
export const MAX_DEPTH = 12;
export const GOOGLE_DOC = "application/vnd.google-apps.document";
export const GOOGLE_SHEET = "application/vnd.google-apps.spreadsheet";
const FILE_ID_RE = /^[A-Za-z0-9_-]{5,200}$/;
const TEXT_MIMES = new Set(["application/json", "application/markdown", "application/x-markdown", "application/x-subrip", "text/vtt"]);

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  md5Checksum?: string;
  size?: string;
  modifiedTime?: string;
  trashed?: boolean;
}
export interface DriveListItem { id: string; name: string; mimeType: string; modifiedTime?: string; size?: string }
export interface DriveText { text: string; mime: string; truncated: boolean }

export class DriveError extends Error {
  constructor(message: string, readonly code: "outside_root" | "unsupported" | "invalid" | "api" = "api") {
    super(message);
  }
}

export const isReadableMime = (mime: string): boolean => mime === GOOGLE_DOC || mime.startsWith("text/") || TEXT_MIMES.has(mime);
export const sourceKindFor = (mime: string): "drive_doc" | "drive_sheet" | "drive_file" =>
  mime === GOOGLE_DOC ? "drive_doc" : mime === GOOGLE_SHEET ? "drive_sheet" : "drive_file";

function assertFileId(id: string): void {
  if (typeof id !== "string" || !FILE_ID_RE.test(id)) throw new DriveError("invalid Drive file id", "invalid");
}

/**
 * Read-only Drive v3 client. Every public operation is confined to the ANA Evidence Root:
 * the target's parent chain must reach `rootId` within MAX_DEPTH hops, and trashed files are refused.
 */
export class DriveClient {
  /** folder id -> is (transitively) under the root; per process. */
  private readonly ancestry = new Map<string, boolean>();

  constructor(private readonly tokens: DriveTokenProvider, readonly rootId: string, private readonly apiBase = DRIVE_API) {
    assertFileId(rootId);
    this.ancestry.set(rootId, true);
  }

  /** Metadata of a file inside the root (the root itself included). */
  async get(fileId: string): Promise<DriveFile> {
    return this.guard(fileId);
  }

  /** Non-trashed children of a folder inside the root (default: the root), all pages. */
  async list(folderId: string = this.rootId): Promise<DriveListItem[]> {
    await this.guard(folderId);
    const out: DriveListItem[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed=false`,
        fields: "nextPageToken,files(id,name,mimeType,modifiedTime,size)",
        pageSize: "1000", supportsAllDrives: "true", includeItemsFromAllDrives: "true",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const data = (await (await this.call(`/files?${params}`)).json()) as { files?: DriveListItem[]; nextPageToken?: string };
      for (const f of data.files ?? []) out.push({ id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime, size: f.size });
      pageToken = data.nextPageToken;
    } while (pageToken);
    return out;
  }

  /** Text of a Google Doc (export text/plain) or a text-like file. Other types (recordings, binaries) are refused. */
  async readText(fileId: string, maxBytes = 2_000_000): Promise<DriveText & { file: DriveFile }> {
    const file = await this.guard(fileId);
    let res: Response;
    if (file.mimeType === GOOGLE_DOC) res = await this.call(`/files/${fileId}/export?${new URLSearchParams({ mimeType: "text/plain" })}`);
    else if (isReadableMime(file.mimeType)) res = await this.call(`/files/${fileId}?${new URLSearchParams({ alt: "media", supportsAllDrives: "true" })}`);
    else throw new DriveError(`unsupported mime type for text read: ${file.mimeType} (only Google Docs and text files are read)`, "unsupported");
    const { bytes, truncated } = await readBounded(res, maxBytes);
    let text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (truncated) text = text.replace(/\uFFFD$/, "");
    return { text, mime: file.mimeType, truncated, file };
  }

  private async meta(fileId: string): Promise<DriveFile> {
    assertFileId(fileId);
    const params = new URLSearchParams({ fields: "id,name,mimeType,parents,md5Checksum,size,modifiedTime,trashed", supportsAllDrives: "true" });
    return (await (await this.call(`/files/${fileId}?${params}`)).json()) as DriveFile;
  }

  /** Root guard: returns the file's metadata or throws 'outside ANA Evidence Root'. */
  private async guard(fileId: string): Promise<DriveFile> {
    assertFileId(fileId);
    let file: DriveFile;
    try {
      file = await this.meta(fileId);
    } catch (e) {
      if (e instanceof DriveError && /HTTP 404/.test(e.message)) throw new DriveError(OUTSIDE_ROOT, "outside_root");
      throw e;
    }
    if (file.trashed) throw new DriveError(OUTSIDE_ROOT, "outside_root");
    if (file.id === this.rootId) return file;
    if (!(await this.parentsUnderRoot(file.parents ?? [], 1))) throw new DriveError(OUTSIDE_ROOT, "outside_root");
    return file;
  }

  private async parentsUnderRoot(parents: string[], depth: number): Promise<boolean> {
    if (depth > MAX_DEPTH) return false;
    for (const p of parents) {
      if (!FILE_ID_RE.test(p)) continue;
      const known = this.ancestry.get(p);
      if (known !== undefined) {
        if (known) return true;
        continue;
      }
      let folder: DriveFile;
      try {
        folder = await this.meta(p);
      } catch (e) {
        if (e instanceof DriveError && /HTTP 40[34]/.test(e.message)) {
          this.ancestry.set(p, false);
          continue;
        }
        throw e;
      }
      const ok = !folder.trashed && (await this.parentsUnderRoot(folder.parents ?? [], depth + 1));
      // cache only positive results: a negative may be a depth cut-off relative to this walk
      if (ok) {
        this.ancestry.set(p, true);
        return true;
      }
    }
    return false;
  }

  private async call(pathAndQuery: string, retried = false): Promise<Response> {
    const token = await this.tokens.accessToken();
    let res: Response;
    try {
      res = await fetch(`${this.apiBase}${pathAndQuery}`, { headers: { authorization: `Bearer ${token}` } });
    } catch {
      throw new DriveError("Drive API request failed: network error");
    }
    if (res.status === 401 && !retried) {
      this.tokens.invalidate();
      return this.call(pathAndQuery, true);
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new DriveError(`Drive API error: HTTP ${res.status}`);
    }
    return res;
  }
}

async function readBounded(res: Response, maxBytes: number): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  const reader = res.body?.getReader();
  if (!reader) return { bytes: new Uint8Array(), truncated };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (total + value.length > maxBytes) {
      chunks.push(value.subarray(0, maxBytes - total));
      total = maxBytes;
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
    total += value.length;
  }
  const bytes = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    bytes.set(c, off);
    off += c.length;
  }
  return { bytes, truncated };
}
