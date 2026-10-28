import { lstatSync, realpathSync } from "node:fs";
import net from "node:net";
import path from "node:path";

/** Resolve existing ancestors as well as the target: a symlink is never an escape from the evidence boundary. */
export function isOutsideRepository(target: string, repo: string): boolean {
  const canonical = (value: string): string => {
    const absolute = path.resolve(value);
    try {
      lstatSync(absolute);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return path.join(canonical(path.dirname(absolute)), path.basename(absolute));
    }
    return realpathSync(absolute);
  };
  try {
    const relative = path.relative(canonical(repo), canonical(target));
    return relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
  } catch {
    return false;
  }
}

export function liveVerdict(ready: boolean, failures: number, passed: number, expected: number) {
  return !ready ? "BLOCKED" : failures > 0 ? "FAIL" : passed === expected ? "PASS" : "PARTIAL";
}

/** Public unicast only; IPv6 is restricted to the globally routable 2000::/3 allocation. */
export function isPublicIp(ip: string): boolean {
  if (net.isIP(ip) === 4) {
    const [a, b, c] = ip.split(".").map(Number) as [number, number, number];
    return !(a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113) || a >= 224);
  }
  if (net.isIP(ip) === 6) {
    const first = parseInt(ip.split(":")[0]!, 16);
    const expanded = new URL(`http://[${ip}]/`).hostname.toLowerCase();
    return first >= 0x2000 && first <= 0x3fff && !/^\[2001:db8:/.test(expanded);
  }
  return false;
}
