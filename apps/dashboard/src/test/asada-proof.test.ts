// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isOutsideRepository, isPublicIp, liveVerdict } from "./asada-proof";

describe("live ASADA evidence", () => {
  it("requires all tests to pass and keeps blocked, failed and filtered runs distinct", () => {
    expect(liveVerdict(false, 1, 0, 14)).toBe("BLOCKED");
    expect(liveVerdict(true, 1, 13, 14)).toBe("FAIL");
    expect(liveVerdict(true, 0, 1, 14)).toBe("PARTIAL");
    expect(liveVerdict(true, 0, 13, 14)).toBe("PARTIAL");
    expect(liveVerdict(true, 0, 14, 14)).toBe("PASS");
  });

  it("rejects repository paths, symlinked ancestors and symlinked result files", () => {
    const temp = mkdtempSync(path.join(os.tmpdir(), "asada-proof-"));
    try {
      const repo = path.join(temp, "repo");
      mkdirSync(repo);
      symlinkSync(repo, path.join(temp, "alias"));
      symlinkSync(repo, path.join(temp, "asada-live-result.json"));
      expect(isOutsideRepository(repo, repo)).toBe(false);
      expect(isOutsideRepository(path.join(repo, "new", "result.json"), repo)).toBe(false);
      expect(isOutsideRepository(path.join(temp, "alias", "new", "result.json"), repo)).toBe(false);
      expect(isOutsideRepository(path.join(temp, "asada-live-result.json"), repo)).toBe(false);
      expect(isOutsideRepository(path.join(temp, "evidence", "result.json"), repo)).toBe(true);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it.each(["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.0.1", "169.254.0.1", "100.64.0.1", "192.0.2.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "::", "::1", "0:0:0:0:0:0:0:1", "fe90::1", "fc00::1", "ff02::1", "::ffff:127.0.0.1", "2001:db8::1", "not-an-ip"])("rejects non-public origin %s", (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });
  it.each(["8.8.8.8", "2606:4700:4700::1111"])("accepts public origin %s", (ip) => {
    expect(isPublicIp(ip)).toBe(true);
  });
});
