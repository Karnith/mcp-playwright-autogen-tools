#!/usr/bin/env node

import { FastMCP, type Context } from "fastmcp";
import { z } from "zod";
import { ToolHandler } from "./toolHandler.js";
import { v4 as uuidv4 } from "uuid";
import type { ContentResult, TextContent, ImageContent } from "fastmcp";

// Define the session data type
type SessionData = {
  id: string;
};

const toolHandler = new ToolHandler({
  maxSessions: 10,
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
});

const server = new FastMCP({
  name: "executeautomation/playwright-mcp-server",
  version: "1.0.1",
});

// Store active sessions with their metadata
type SessionMetadata = {
  clientId: string;
  sessionId: string;
  connected: boolean;
};

const sessions = new Map<string, SessionMetadata>();

// Handle client connections
server.on("connect", (event) => {
  const sessionId = uuidv4();
  const clientId = uuidv4();

  sessions.set(clientId, {
    clientId,
    sessionId,
    connected: true,
  });

  console.log(`Client connected: ${clientId}, Session: ${sessionId}`);
});

// Handle client disconnections
server.on("disconnect", async (event) => {
  try {
    const clientsToDisconnect = Array.from(sessions.values()).filter(
      (session) => session.connected
    );

    // Mark all sessions as disconnected first
    for (const session of clientsToDisconnect) {
      session.connected = false;
    }

    // Then handle cleanup in the background
    setImmediate(async () => {
      try {
        await Promise.allSettled(
          clientsToDisconnect.map(async (session) => {
            try {
              await toolHandler.close(session.sessionId);
              sessions.delete(session.clientId);
              console.log(
                `Client disconnected: ${session.clientId}, Session: ${session.sessionId}`
              );
            } catch (closeError) {
              if (closeError instanceof Error) {
                // Only log if it's not a connection closed error
                if (!closeError.message?.includes("Connection closed")) {
                  console.error(
                    `Error closing session for client ${session.clientId}:`,
                    closeError
                  );
                }
              }
            }
          })
        );
      } catch (error) {
        console.error("Error during client disconnection cleanup:", error);
      }
    });
  } catch (error) {
    console.error("Error in disconnect handler:", error);
  }
});

// Handle process termination
process.on("SIGTERM", () => gracefulShutdown());
process.on("SIGINT", () => gracefulShutdown());

// Graceful shutdown helper
async function gracefulShutdown() {
  console.log("Starting graceful shutdown...");

  try {
    // Stop accepting new connections
    await server.stop();
    console.log("Server stopped accepting new connections");

    // Get all active sessions
    const activeSessions = Array.from(sessions.values()).filter(
      (session) => session.connected
    );

    if (activeSessions.length > 0) {
      console.log(`Closing ${activeSessions.length} active sessions...`);

      await Promise.allSettled(
        activeSessions.map(async (session) => {
          try {
            await toolHandler.close(session.sessionId);
            console.log(`Closed session for client: ${session.clientId}`);
          } catch (error) {
            if (
              error instanceof Error &&
              !error.message?.includes("Connection closed")
            ) {
              console.error(
                `Error closing session for client ${session.clientId}:`,
                error
              );
            }
          } finally {
            sessions.delete(session.clientId);
          }
        })
      );
    }

    console.log("All sessions cleaned up");
  } catch (error) {
    console.error("Error during shutdown:", error);
  } finally {
    // Ensure we exit even if there are pending promises
    setTimeout(() => process.exit(1), 1000).unref();
    process.exit(0);
  }
}

// Global error handlers
process.on("uncaughtException", (error: Error) => {
  // Ignore known connection closed errors
  if (error.message?.includes("Connection closed")) {
    console.debug("Debug: Connection closed normally");
    return;
  }

  console.error("Uncaught error:", error);
});

process.on("unhandledRejection", (reason: any) => {
  // Ignore known connection closed errors
  if (
    reason instanceof Error &&
    reason.message?.includes("Connection closed")
  ) {
    console.debug("Debug: Promise rejected due to normal connection closure");
    return;
  }

  console.error("Unhandled promise rejection:", reason);
});

// Define tool parameters using zod schemas
const NavigateParams = z.object({
  url: z.string(),
  browserType: z.enum(["chromium", "firefox", "webkit"]).default("chromium"),
  width: z.number().default(1280),
  height: z.number().default(720),
  timeout: z.number().default(30000),
  waitUntil: z.string().default("load"),
  headless: z.boolean().default(false),
});

const ScreenshotParams = z.object({
  name: z.string(),
  selector: z.string(),
  width: z.number().default(1280),
  height: z.number().default(720),
  storeBase64: z.boolean().default(false),
  fullPage: z.boolean().default(false),
  savePng: z.boolean().default(false),
  downloadsDir: z.string().default("./screenshots"),
});

const ClickParams = z.object({
  selector: z.string(),
});

const IframeClickParams = z.object({
  iframeSelector: z.string(),
  selector: z.string(),
});

const FillParams = z.object({
  selector: z.string(),
  value: z.string(),
});

const SelectParams = z.object({
  selector: z.string(),
  value: z.string(),
});

const HoverParams = z.object({
  selector: z.string(),
});

const EvaluateParams = z.object({
  script: z.string(),
});

const ConsoleLogsParams = z.object({
  type: z.string(),
  search: z.string(),
  limit: z.number(),
  clear: z.boolean(),
});

interface ConnectionContext {
  connectionId: string;
}

// Navigation tool
server.addTool({
  name: "playwright_navigate",
  description: "Navigate to a URL using Playwright",
  parameters: NavigateParams,
  execute: async (
    params: z.infer<typeof NavigateParams>,
    context: Context<SessionData>
  ) => {
    const clientId = (context.session as any).id as string;
    const session = sessions.get(clientId);

    if (!session || !session.connected) {
      throw new Error("No active session found for connection");
    }

    await toolHandler.navigate(session.sessionId, {
      url: params.url,
      browserType: params.browserType,
      width: params.width,
      height: params.height,
      timeout: params.timeout,
      waitUntil: params.waitUntil,
      headless: params.headless,
    });

    return {
      type: "text",
      text: "Navigation successful",
    } as TextContent;
  },
});

// Screenshot tool
server.addTool({
  name: "playwright_screenshot",
  description: "Take a screenshot using Playwright",
  parameters: ScreenshotParams,
  execute: async (
    params: z.infer<typeof ScreenshotParams>,
    context: Context<SessionData>
  ) => {
    const clientId = (context.session as any).id as string;
    const session = sessions.get(clientId);
    if (!session || !session.connected) {
      throw new Error("No active session found for connection");
    }
    const screenshot = await toolHandler.screenshot(session.sessionId, {
      name: params.name,
      selector: params.selector,
      width: params.width,
      height: params.height,
      storeBase64: params.storeBase64,
      fullPage: params.fullPage,
      savePng: params.savePng,
      downloadsDir: params.downloadsDir,
    });
    return {
      type: "image",
      data: screenshot,
      mimeType: "image/png",
    } as ImageContent;
  },
});

// Click tool
server.addTool({
  name: "playwright_click",
  description: "Click an element using Playwright",
  parameters: ClickParams,
  execute: async (
    params: z.infer<typeof ClickParams>,
    context: Context<SessionData>
  ) => {
    const clientId = (context.session as any).id as string;
    const session = sessions.get(clientId);
    if (!session || !session.connected) {
      throw new Error("No active session found for connection");
    }
    await toolHandler.click(session.sessionId, { selector: params.selector });
    return {
      type: "text",
      text: "Click successful",
    } as TextContent;
  },
});

// IFrame click tool
server.addTool({
  name: "playwright_iframe_click",
  description: "Click an element in an iframe using Playwright",
  parameters: IframeClickParams,
  execute: async (
    params: z.infer<typeof IframeClickParams>,
    context: Context<SessionData>
  ) => {
    const clientId = (context.session as any).id as string;
    const session = sessions.get(clientId);
    if (!session || !session.connected) {
      throw new Error("No active session found for connection");
    }
    await toolHandler.iframeClick(session.sessionId, {
      iframeSelector: params.iframeSelector,
      selector: params.selector,
    });
    return {
      type: "text",
      text: "IFrame click successful",
    } as TextContent;
  },
});

// Fill tool
server.addTool({
  name: "playwright_fill",
  description: "Fill a form field using Playwright",
  parameters: FillParams,
  execute: async (
    params: z.infer<typeof FillParams>,
    context: Context<SessionData>
  ) => {
    const clientId = (context.session as any).id as string;
    const session = sessions.get(clientId);
    if (!session || !session.connected) {
      throw new Error("No active session found for connection");
    }
    await toolHandler.fill(session.sessionId, {
      selector: params.selector,
      value: params.value,
    });
    return {
      type: "text",
      text: "Fill successful",
    } as TextContent;
  },
});

// Select tool
server.addTool({
  name: "playwright_select",
  description: "Select an option using Playwright",
  parameters: SelectParams,
  execute: async (
    params: z.infer<typeof SelectParams>,
    context: Context<SessionData>
  ) => {
    const clientId = (context.session as any).id as string;
    const session = sessions.get(clientId);
    if (!session || !session.connected) {
      throw new Error("No active session found for connection");
    }
    await toolHandler.select(session.sessionId, {
      selector: params.selector,
      value: params.value,
    });
    return {
      type: "text",
      text: "Select successful",
    } as TextContent;
  },
});

// Hover tool
server.addTool({
  name: "playwright_hover",
  description: "Hover over an element using Playwright",
  parameters: HoverParams,
  execute: async (
    params: z.infer<typeof HoverParams>,
    context: Context<SessionData>
  ) => {
    const clientId = (context.session as any).id as string;
    const session = sessions.get(clientId);
    if (!session || !session.connected) {
      throw new Error("No active session found for connection");
    }
    await toolHandler.hover(session.sessionId, { selector: params.selector });
    return {
      type: "text",
      text: "Hover successful",
    } as TextContent;
  },
});

// Evaluate tool
server.addTool({
  name: "playwright_evaluate",
  description: "Evaluate JavaScript code using Playwright",
  parameters: EvaluateParams,
  execute: async (
    params: z.infer<typeof EvaluateParams>,
    context: Context<SessionData>
  ) => {
    const clientId = (context.session as any).id as string;
    const session = sessions.get(clientId);
    if (!session || !session.connected) {
      throw new Error("No active session found for connection");
    }
    const result = await toolHandler.evaluate(session.sessionId, {
      script: params.script,
    });
    return {
      type: "text",
      text: JSON.stringify(result),
    } as TextContent;
  },
});

// Console logs tool
server.addTool({
  name: "playwright_console_logs",
  description: "Get console logs from Playwright",
  parameters: ConsoleLogsParams,
  execute: async (
    params: z.infer<typeof ConsoleLogsParams>,
    context: Context<SessionData>
  ) => {
    const clientId = (context.session as any).id as string;
    const session = sessions.get(clientId);
    if (!session || !session.connected) {
      throw new Error("No active session found for connection");
    }
    const logs = await toolHandler.getConsoleLogs(session.sessionId, {
      type: params.type,
      search: params.search,
      limit: params.limit,
      clear: params.clear,
    });
    return {
      type: "text",
      text: JSON.stringify(logs),
    } as TextContent;
  },
});

// Close tool
server.addTool({
  name: "playwright_close",
  description: "Close the browser using Playwright",
  parameters: z.object({}),
  execute: async (_, context: Context<SessionData>) => {
    const clientId = (context.session as any).id as string;
    const session = sessions.get(clientId);
    if (session && session.connected) {
      await toolHandler.close(session.sessionId);
      sessions.delete(clientId);
    }
    return {
      type: "text",
      text: "Browser closed successfully",
    } as TextContent;
  },
});

// Get port from environment variable or use default
const port = process.env.PORT ? parseInt(process.env.PORT) : 3338;

// Start the server with SSE transport
server.start({
  transportType: "sse",
  sse: {
    endpoint: "/sse",
    port: port,
  },
});

console.log(`Server started on http://localhost:${port}/sse`);
