export const COLLECTION = "ana_brain_v1";

export interface PointPayload {
  note_id: string;
  chunk: number;
  type: string;
  status: string;
  topics: string[];
  workshops: string[];
  source_ids: string[];
  content_sha: string;
  embed_model: string;
  index_version: number;
  retired: boolean;
}
export interface Point { id: string; vector: number[]; payload: PointPayload }
export interface ScoredPoint { id: string; score: number; payload: PointPayload }
export interface Filter { must: { key: string; match: { value: string | boolean } }[] }

export interface VectorStore {
  ensureCollection(size: number): Promise<void>;
  drop(): Promise<void>;
  upsert(points: Point[]): Promise<void>;
  delete(ids: string[]): Promise<void>;
  setPayload(ids: string[], payload: Partial<PointPayload>): Promise<void>;
  search(vector: number[], limit: number, filter?: Filter): Promise<ScoredPoint[]>;
  retrieve(ids: string[]): Promise<Point[]>;
}

export class CollectionMismatchError extends Error {}

export class QdrantStore implements VectorStore {
  private readonly base: string;
  constructor(url: string, private readonly collection = COLLECTION, private readonly apiKey?: string) {
    this.base = `${url.replace(/\/$/, "")}/collections/${encodeURIComponent(collection)}`;
  }

  private async call<T>(method: string, suffix: string, body?: unknown, allow404 = false): Promise<T | undefined> {
    const res = await fetch(`${this.base}${suffix}`, {
      method,
      headers: { "content-type": "application/json", ...(this.apiKey ? { "api-key": this.apiKey } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (allow404 && res.status === 404) return undefined;
    if (!res.ok) throw new Error(`qdrant ${method} ${suffix || "/"} failed: HTTP ${res.status}`);
    return ((await res.json()) as { result: T }).result;
  }

  async ensureCollection(size: number): Promise<void> {
    const info = await this.call<{ config: { params: { vectors: { size?: number; distance?: string } } } }>("GET", "", undefined, true);
    if (!info) {
      await this.call("PUT", "", { vectors: { size, distance: "Cosine" } });
      return;
    }
    const v = info.config.params.vectors;
    if (v.size !== size || (v.distance && v.distance !== "Cosine"))
      throw new CollectionMismatchError(`collection ${this.collection} exists with size ${v.size}/${v.distance}, expected ${size}/Cosine`);
  }

  async drop(): Promise<void> {
    await this.call("DELETE", "", undefined, true);
  }

  async upsert(points: Point[]): Promise<void> {
    for (let i = 0; i < points.length; i += 64) await this.call("PUT", "/points?wait=true", { points: points.slice(i, i + 64) });
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length) await this.call("POST", "/points/delete?wait=true", { points: ids });
  }

  async setPayload(ids: string[], payload: Partial<PointPayload>): Promise<void> {
    if (ids.length) await this.call("POST", "/points/payload?wait=true", { payload, points: ids });
  }

  async search(vector: number[], limit: number, filter?: Filter): Promise<ScoredPoint[]> {
    return (await this.call<ScoredPoint[]>("POST", "/points/search", { vector, limit, filter, with_payload: true })) ?? [];
  }

  async retrieve(ids: string[]): Promise<Point[]> {
    if (!ids.length) return [];
    return (await this.call<Point[]>("POST", "/points", { ids, with_vector: true, with_payload: true })) ?? [];
  }
}
