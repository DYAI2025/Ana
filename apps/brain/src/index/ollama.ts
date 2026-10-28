export const EMBED_MODEL = "bge-m3:latest";
export const EMBED_DIM = 1024;

export interface Embedder {
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
  /** Content digest of the model behind the tag: a re-pull under the same tag must not mix vectors of two builds. */
  identity(): Promise<string>;
}

export class DimensionError extends Error {}

export class OllamaEmbedder implements Embedder {
  constructor(private readonly baseUrl: string, readonly model = EMBED_MODEL, private readonly dim = EMBED_DIM) {}

  async identity(): Promise<string> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/tags`);
    if (!res.ok) throw new Error(`ollama tags failed: HTTP ${res.status}`);
    const json = (await res.json()) as { models?: { name?: string; model?: string; digest?: string }[] };
    const m = (json.models ?? []).find((x) => x.name === this.model || x.model === this.model);
    if (!m) throw new Error(`model ${this.model} is not present in Ollama`);
    if (typeof m.digest !== "string" || !/^(sha256:)?[a-f0-9]{64}$/.test(m.digest)) throw new Error(`model ${this.model} has no usable digest`);
    return m.digest;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) throw new Error(`ollama embed failed: HTTP ${res.status}`);
    const json = (await res.json()) as { model?: string; embeddings?: number[][] };
    const vecs = json.embeddings;
    if (!Array.isArray(vecs) || vecs.length !== texts.length) throw new Error("ollama embed returned an unexpected shape");
    for (const v of vecs)
      if (!Array.isArray(v) || v.length !== this.dim) throw new DimensionError(`model ${this.model} returned dimension ${Array.isArray(v) ? v.length : "?"}, expected ${this.dim}`);
    return vecs;
  }
}
