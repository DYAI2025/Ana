export type Vec = number[];

export const dot = (a: Vec, b: Vec) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);
export const norm = (a: Vec) => Math.sqrt(dot(a, a));

export function mean(vs: Vec[]): Vec {
  const d = vs[0]?.length ?? 0;
  const out = new Array<number>(d).fill(0);
  for (const v of vs) for (let i = 0; i < d; i++) out[i]! += v[i]! / vs.length;
  return out;
}

/**
 * PCA to `dims` components via power iteration with deflation on the Gram matrix (n x n), deterministic.
 * Returns n rows of `dims` coordinates (scores), with a fixed sign convention.
 */
export function pca(rows: Vec[], dims = 3, iters = 200): Vec[] {
  const n = rows.length;
  if (n === 0) return [];
  const mu = mean(rows);
  const X = rows.map((r) => r.map((x, i) => x - mu[i]!));
  const G = X.map((a) => X.map((b) => dot(a, b)));
  const out: Vec[] = Array.from({ length: n }, () => new Array<number>(dims).fill(0));
  for (let k = 0; k < Math.min(dims, n); k++) {
    let v = Array.from({ length: n }, (_, i) => 1 + ((i * 7 + k * 13) % 11) / 10);
    let lambda = 0;
    for (let t = 0; t < iters; t++) {
      const w = G.map((row) => dot(row, v));
      const nw = norm(w);
      if (nw < 1e-12) {
        lambda = 0;
        break;
      }
      v = w.map((x) => x / nw);
      lambda = nw;
    }
    if (lambda < 1e-12) break;
    let maxIdx = 0;
    for (let i = 1; i < n; i++) if (Math.abs(v[i]!) > Math.abs(v[maxIdx]!) + 1e-12) maxIdx = i;
    if (v[maxIdx]! < 0) v = v.map((x) => -x);
    const s = Math.sqrt(lambda);
    for (let i = 0; i < n; i++) out[i]![k] = v[i]! * s;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) G[i]![j]! -= lambda * v[i]! * v[j]!;
  }
  return out;
}

/** Centre and scale points so that every point lies within the unit sphere (max radius 1). */
export function toUnitSphere(points: Vec[]): Vec[] {
  if (!points.length) return [];
  const mu = mean(points);
  const c = points.map((p) => p.map((x, i) => x - mu[i]!));
  const r = Math.max(...c.map(norm));
  return r < 1e-12 ? c.map((p) => p.map(() => 0)) : c.map((p) => p.map((x) => x / r));
}

/** Deterministic k-means (farthest-point init from row 0). Returns assignment per row. */
export function kmeans(rows: Vec[], k: number, iters = 50): number[] {
  const n = rows.length;
  if (n === 0) return [];
  k = Math.max(1, Math.min(k, n));
  const d2 = (a: Vec, b: Vec) => a.reduce((s, x, i) => s + (x - b[i]!) ** 2, 0);
  const centers: Vec[] = [rows[0]!];
  while (centers.length < k) {
    let best = 0;
    let bestD = -1;
    rows.forEach((r, i) => {
      const dmin = Math.min(...centers.map((c) => d2(r, c)));
      if (dmin > bestD + 1e-12) {
        bestD = dmin;
        best = i;
      }
    });
    centers.push(rows[best]!);
  }
  let assign = new Array<number>(n).fill(0);
  for (let t = 0; t < iters; t++) {
    const next = rows.map((r) => {
      let bi = 0;
      let bd = Infinity;
      centers.forEach((c, ci) => {
        const dd = d2(r, c);
        if (dd < bd - 1e-12) {
          bd = dd;
          bi = ci;
        }
      });
      return bi;
    });
    const changed = next.some((a, i) => a !== assign[i]);
    assign = next;
    for (let ci = 0; ci < k; ci++) {
      const members = rows.filter((_, i) => assign[i] === ci);
      if (members.length) centers[ci] = mean(members);
    }
    if (!changed && t > 0) break;
  }
  return assign;
}

export const clusterCount = (n: number) => (n < 3 ? Math.min(n, 1) : Math.max(2, Math.min(8, Math.round(Math.sqrt(n / 2)))));
