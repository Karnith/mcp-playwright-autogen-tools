import type { Browser, Page } from "playwright";
import { chromium, firefox, webkit } from "playwright";
import { EventEmitter } from "events";

export interface BrowserSettings {
  viewport?: {
    width?: number;
    height?: number;
  };
  userAgent?: string;
  headless?: boolean;
  browserType?: "chromium" | "firefox" | "webkit";
}

export interface SessionState {
  browser?: Browser;
  page?: Page;
  currentBrowserType: "chromium" | "firefox" | "webkit";
  lastActivity: number;
}

export class SessionManager extends EventEmitter {
  private sessions: Map<string, SessionState> = new Map();
  private readonly maxSessions: number;
  private readonly sessionTimeout: number; // in milliseconds

  constructor(options: { maxSessions?: number; sessionTimeout?: number } = {}) {
    super();
    this.maxSessions = options.maxSessions || 10;
    this.sessionTimeout = options.sessionTimeout || 30 * 60 * 1000; // 30 minutes default

    // Start cleanup interval
    setInterval(() => this.cleanupInactiveSessions(), 60 * 1000); // Check every minute
  }

  async getOrCreateSession(
    sessionId: string,
    browserSettings?: BrowserSettings
  ): Promise<SessionState> {
    let session = this.sessions.get(sessionId);

    if (!session) {
      // Check if we've hit the session limit
      if (this.sessions.size >= this.maxSessions) {
        // Try to cleanup inactive sessions first
        await this.cleanupInactiveSessions();

        // If we're still at the limit, throw an error
        if (this.sessions.size >= this.maxSessions) {
          throw new Error("Maximum number of concurrent sessions reached");
        }
      }

      // Create new session
      session = {
        currentBrowserType: browserSettings?.browserType || "chromium",
        lastActivity: Date.now(),
      };
      this.sessions.set(sessionId, session);
    }

    // Update last activity
    session.lastActivity = Date.now();

    // Ensure browser is running
    await this.ensureBrowser(session, browserSettings);

    return session;
  }

  private async ensureBrowser(
    session: SessionState,
    browserSettings?: BrowserSettings
  ): Promise<void> {
    try {
      // Check if browser exists but is disconnected
      if (session.browser && !session.browser.isConnected()) {
        await this.cleanupSession(session);
      }

      // Launch new browser if needed
      if (!session.browser) {
        const {
          viewport,
          userAgent,
          headless = false,
          browserType = "chromium",
        } = browserSettings ?? {};

        // If browser type is changing, force a new browser instance
        if (session.browser && session.currentBrowserType !== browserType) {
          await this.cleanupSession(session);
        }

        console.log(
          `Launching new ${browserType} browser instance for session...`
        );

        // Use the appropriate browser engine
        let browserInstance;
        switch (browserType) {
          case "firefox":
            browserInstance = firefox;
            break;
          case "webkit":
            browserInstance = webkit;
            break;
          case "chromium":
          default:
            browserInstance = chromium;
            break;
        }

        session.browser = await browserInstance.launch({ headless });
        session.currentBrowserType = browserType;

        // Add cleanup logic when browser is disconnected
        session.browser.on("disconnected", () => {
          console.log("Browser disconnected event triggered");
          this.cleanupSession(session);
        });

        const context = await session.browser.newContext({
          ...(userAgent && { userAgent }),
          viewport: {
            width: viewport?.width ?? 1280,
            height: viewport?.height ?? 720,
          },
          deviceScaleFactor: 1,
        });

        session.page = await context.newPage();
      }

      // Verify page is still valid
      if (!session.page || session.page.isClosed()) {
        console.log("Page is closed or invalid. Creating new page...");
        const context =
          session.browser.contexts()[0] || (await session.browser.newContext());
        session.page = await context.newPage();
      }
    } catch (error) {
      console.error("Error ensuring browser:", error);
      await this.cleanupSession(session);
      throw error;
    }
  }

  private async cleanupSession(session: SessionState): Promise<void> {
    try {
      if (session.browser) {
        await session.browser.close().catch(() => {});
      }
    } catch (e) {
      // Ignore errors during cleanup
    }

    session.browser = undefined;
    session.page = undefined;
  }

  private async cleanupInactiveSessions(): Promise<void> {
    const now = Date.now();

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > this.sessionTimeout) {
        console.log(`Cleaning up inactive session: ${sessionId}`);
        await this.cleanupSession(session);
        this.sessions.delete(sessionId);
        this.emit("sessionClosed", sessionId);
      }
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await this.cleanupSession(session);
      this.sessions.delete(sessionId);
      this.emit("sessionClosed", sessionId);
    }
  }

  async closeAllSessions(): Promise<void> {
    for (const [sessionId, session] of this.sessions.entries()) {
      await this.cleanupSession(session);
      this.sessions.delete(sessionId);
      this.emit("sessionClosed", sessionId);
    }
  }
}
