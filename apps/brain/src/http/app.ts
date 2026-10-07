import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { getOAuthProtectedResourceMetadataUrl, mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { DashboardToken, KeyStore } from "../auth/keys.js";
import { BrainOAuthProvider } from "../auth/oauth.js";
import { createMcpServer, type BrainDeps } from "../mcp/tools.js";
import { projection } from "../projection/projection.js";

export interface AppOptions extends BrainDeps { stateDir: string; publicUrl: string; dashboardTokenSha256?: string }

export function createApp(opts: AppOptions): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");
  const keys = new KeyStore(opts.stateDir);
  const provider = new BrainOAuthProvider(opts.stateDir, keys);
  const dashboard = new DashboardToken(opts.stateDir, opts.dashboardTokenSha256);
  const issuer = new URL(opts.publicUrl);
  const resource = new URL("/mcp", issuer);
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(resource);

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  app.use(mcpAuthRouter({ provider, issuerUrl: issuer, resourceServerUrl: resource, scopesSupported: ["brain"], resourceName: "ANA Brain" }));

  app.get("/projection", async (req, res, next) => {
    const m = /^Bearer (.+)$/.exec(req.get("authorization") ?? "");
    if (!m || !dashboard.verify(m[1]!.trim())) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    try {
      opts.vault.reload();
      res.set("cache-control", "no-store").json(await projection(opts.vault, opts.store));
    } catch (e) {
      next(e);
    }
  });

  const auth = requireBearerAuth({ verifier: provider, resourceMetadataUrl });
  app.post("/mcp", auth, express.json({ limit: "256kb" }), async (req: Request, res: Response) => {
    const server = createMcpServer(opts);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  app.all("/mcp", auth, (_req, res) => {
    res.status(405).set("allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server)" }, id: null });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("request failed:", err instanceof Error ? err.name : "error");
    if (!res.headersSent) res.status(500).json({ error: "internal_error" });
  });
  return app;
}
