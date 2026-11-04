import "server-only";

/**
 * The dashboard server's connection to the Brain's protected /mcp interface (an agent key: read tools, CANDIDATE/DERIVED
 * writes, never CONFIRMED, never superseding). The configuration, loopback only, is brainWriterConfigFromEnv.
 */
export interface BrainMcpConfig {
  url: string;
  key: string;
}

const TIMEOUT_MS = 10_000;

/** kind "refused": the Brain answered with a tool error (its text is in the message); "exists": an existing id. */
export class BrainToolError extends Error {
  constructor(
    readonly tool: string,
    detail: string,
    readonly kind: "refused" | "exists" | "unreachable",
  ) {
    super(`${tool}: ${detail}`.slice(0, 200));
  }

  /** safe to show: which step failed and how, without the Brain's text */
  get summary(): string {
    return `${this.tool} ${this.kind}`;
  }
}

export interface BrainMcp {
  /** one tool call; returns the tool's text */
  call(name: string, args: Record<string, unknown>): Promise<string>;
}

export function createBrainMcp(config: BrainMcpConfig, fetchImpl: typeof fetch = fetch): BrainMcp {
  let rpcId = 0;
  return {
    async call(name, args) {
      let response: Response;
      try {
        response = await fetchImpl(config.url, {
          method: "POST",
          headers: { authorization: `Bearer ${config.key}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
          // the Brain is on loopback and never redirects: the key is not sent anywhere else
          redirect: "error",
          cache: "no-store",
        });
      } catch {
        throw new BrainToolError(name, "unreachable", "unreachable");
      }
      if (!response.ok) throw new BrainToolError(name, `HTTP ${response.status}`, "unreachable");
      let body: { result?: { isError?: boolean; content?: Array<{ text?: string }> }; error?: { message?: string } };
      try {
        body = (await response.json()) as typeof body;
      } catch {
        throw new BrainToolError(name, "no JSON answer", "unreachable");
      }
      if (body.error) throw new BrainToolError(name, body.error.message ?? "rpc error", "refused");
      const text = body.result?.content?.[0]?.text ?? "";
      if (body.result?.isError) throw new BrainToolError(name, text, text.startsWith("exists:") ? "exists" : "refused");
      return text;
    },
  };
}
