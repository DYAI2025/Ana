export declare const FAKE_ACCOUNT_ID: string;
export declare const FAKE_HANDLE: string;
export declare const FAKE_OBSERVED_AT: string;

/** A synthetic worker snapshot (snapshot_version 1). */
export declare function buildSnapshot(options?: { count?: number; observedAt?: string }): Record<string, unknown> & {
  media: { items: Array<Record<string, unknown> & { id: string; caption: string; insights: { state: string; metrics: Array<{ name: string; value: number | null; state: string }> } }> };
};

/** Synthetic world reads (ANA-48). */
export declare function buildPulse(options?: { likeBump?: number; fetchedAt?: string }): Record<string, unknown>;
export declare function buildAudience(options?: { unavailable?: boolean }): Record<string, unknown>;

export type FakeSocialFault = { status: number; error?: string } | { hang: true } | { network: true } | { invalid: true } | { empty: true; observedAt?: string } | { observedAt: string };

export declare function createFakeSocial(): {
  reset(): void;
  setFault(fault: FakeSocialFault | null): void;
  setWorld(next: { likeBump?: number; audienceUnavailable?: boolean; pulseStatus?: number | null } | null): void;
  summary(): { calls: number; fault: FakeSocialFault | null };
  handle(method: string, url: string, headers: Record<string, string | undefined>, expectedKey: string): { status?: number; body?: unknown; hang?: true; network?: true };
};
