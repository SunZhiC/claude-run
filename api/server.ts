import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import { streamSSE } from "hono/streaming";
import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import {
  initStorage,
  loadStorage,
  getClaudeDir,
  getSessions,
  getProjects,
  getConversation,
  getConversationStream,
  getSubagentMap,
  getSubagentConversation,
  getSessionTokenUsage,
  deleteSession,
  renameSession,
  searchConversations,
  invalidateHistoryCache,
  addToFileIndex,
} from "./storage";
import {
  initWatcher,
  startWatcher,
  stopWatcher,
  onHistoryChange,
  offHistoryChange,
  onSessionChange,
  offSessionChange,
} from "./watcher";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync } from "fs";
import open from "open";


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getWebDistPath(): string {
  const prodPath = join(__dirname, "web");
  if (existsSync(prodPath)) {
    return prodPath;
  }
  return join(__dirname, "..", "dist", "web");
}

export interface ServerOptions {
  port: number;
  claudeDir?: string;
  dev?: boolean;
  open?: boolean;
}

export function createServer(options: ServerOptions) {
  const { port, claudeDir, dev = false, open: shouldOpen = true } = options;

  initStorage(claudeDir);
  initWatcher(getClaudeDir());

  const app = new Hono();

  if (dev) {
    app.use(
      "*",
      cors({
        origin: ["http://localhost:12000"],
        allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type"],
      }),
    );
  }

  app.get("/api/sessions", async (c) => {
    const sessions = await getSessions();
    return c.json(sessions);
  });

  app.delete("/api/sessions/:id", async (c) => {
    const sessionId = c.req.param("id");
    const deleted = await deleteSession(sessionId);
    if (deleted) {
      return c.json({ success: true });
    }
    return c.json({ error: "Session not found" }, 404);
  });

  app.post("/api/sessions/:id/rename", async (c) => {
    const sessionId = c.req.param("id");
    try {
      const body = await c.req.json<{ name: string }>();
      const name = body?.name?.trim() ?? "";

      if (!name) {
        return c.json({ error: "Name cannot be empty" }, 400);
      }
      if (name.length > 200) {
        return c.json({ error: "Name too long (max 200 characters)" }, 400);
      }

      const success = await renameSession(sessionId, name);
      if (success) {
        return c.json({ success: true });
      }
      return c.json({ error: "Session not found" }, 404);
    } catch {
      return c.json({ error: "Invalid request body" }, 400);
    }
  });

  app.get("/api/projects", async (c) => {
    const projects = await getProjects();
    return c.json(projects);
  });

  app.get("/api/sessions/stream", async (c) => {
    return streamSSE(c, async (stream) => {
      let isConnected = true;
      const knownSessions = new Map<string, number>();

      const cleanup = () => {
        isConnected = false;
        offHistoryChange(handleHistoryChange);
      };

      const handleHistoryChange = async () => {
        if (!isConnected) {
          return;
        }
        try {
          const sessions = await getSessions();
          const newOrUpdated = sessions.filter((s) => {
            const known = knownSessions.get(s.id);
            return known === undefined || known !== s.timestamp;
          });

          for (const s of sessions) {
            knownSessions.set(s.id, s.timestamp);
          }

          if (newOrUpdated.length > 0) {
            await stream.writeSSE({
              event: "sessionsUpdate",
              data: JSON.stringify(newOrUpdated),
            });
          }
        } catch {
          cleanup();
        }
      };

      onHistoryChange(handleHistoryChange);
      c.req.raw.signal.addEventListener("abort", cleanup);

      try {
        const sessions = await getSessions();
        for (const s of sessions) {
          knownSessions.set(s.id, s.timestamp);
        }

        await stream.writeSSE({
          event: "sessions",
          data: JSON.stringify(sessions),
        });

        while (isConnected) {
          await stream.writeSSE({
            event: "heartbeat",
            data: JSON.stringify({ timestamp: Date.now() }),
          });
          await stream.sleep(30000);
        }
      } catch {
        // Connection closed
      } finally {
        cleanup();
      }
    });
  });

  app.get("/api/conversation/:id", async (c) => {
    const sessionId = c.req.param("id");
    const messages = await getConversation(sessionId);
    return c.json(messages);
  });

  app.get("/api/conversation/:id/subagents", async (c) => {
    const sessionId = c.req.param("id");
    const infos = await getSubagentMap(sessionId);
    return c.json(infos);
  });

  app.get("/api/conversation/:id/subagent/:agentId", async (c) => {
    const sessionId = c.req.param("id");
    const agentId = c.req.param("agentId");
    const messages = await getSubagentConversation(sessionId, agentId);
    return c.json(messages);
  });

  app.get("/api/conversation/:id/usage", async (c) => {
    const sessionId = c.req.param("id");
    const usage = await getSessionTokenUsage(sessionId);
    return c.json(usage);
  });

  app.get("/api/conversation/:id/stream", async (c) => {
    const sessionId = c.req.param("id");
    const offsetParam = c.req.query("offset");
    let offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    return streamSSE(c, async (stream) => {
      let isConnected = true;

      const cleanup = () => {
        isConnected = false;
        offSessionChange(handleSessionChange);
      };

      const handleSessionChange = async (changedSessionId: string) => {
        if (changedSessionId !== sessionId || !isConnected) {
          return;
        }

        const { messages: newMessages, nextOffset: newOffset } =
          await getConversationStream(sessionId, offset);
        offset = newOffset;

        if (newMessages.length > 0) {
          try {
            await stream.writeSSE({
              event: "messages",
              data: JSON.stringify(newMessages),
            });
          } catch {
            cleanup();
          }
        }
      };

      onSessionChange(handleSessionChange);
      c.req.raw.signal.addEventListener("abort", cleanup);

      try {
        const { messages, nextOffset } = await getConversationStream(
          sessionId,
          offset,
        );
        offset = nextOffset;

        await stream.writeSSE({
          event: "messages",
          data: JSON.stringify(messages),
        });

        while (isConnected) {
          await stream.writeSSE({
            event: "heartbeat",
            data: JSON.stringify({ timestamp: Date.now() }),
          });
          await stream.sleep(30000);
        }
      } catch {
        // Connection closed
      } finally {
        cleanup();
      }
    });
  });

  app.post("/api/search", async (c) => {
    const body = await c.req.json<{ query: string }>();
    const query = body?.query?.trim() ?? "";

    if (!query) {
      return c.json({ results: [] });
    }

    const results = await searchConversations(query);
    return c.json({ results });
  });

  const webDistPath = getWebDistPath();

  app.use("/*", serveStatic({ root: webDistPath }));

  app.get("/*", async (c) => {
    const indexPath = join(webDistPath, "index.html");
    try {
      const html = readFileSync(indexPath, "utf-8");
      return c.html(html);
    } catch {
      return c.text("UI not found. Run 'pnpm build' first.", 404);
    }
  });

  onHistoryChange(() => {
    invalidateHistoryCache();
  });

  onSessionChange((sessionId: string, filePath: string) => {
    addToFileIndex(sessionId, filePath);
  });

  startWatcher();

  let httpServer: ServerType | null = null;

  return {
    app,
    port,
    start: async () => {
      await loadStorage();
      const openUrl = `http://localhost:${dev ? 12000 : port}/`;

      console.log(`\n  claude-run is running at ${openUrl}\n`);
      if (!dev && shouldOpen) {
        open(openUrl).catch(console.error);
      }

      httpServer = serve({
        fetch: app.fetch,
        port,
      });

      return httpServer;
    },
    stop: () => {
      stopWatcher();
      if (httpServer) {
        httpServer.close();
      }
    },
  };
}
