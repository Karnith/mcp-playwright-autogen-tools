import {
  mockPage,
  mockChromium,
  mockRequest,
  mockFs,
  mockPath,
  resetAllMocks,
} from "./helpers";

// Mock the playwright module
jest.mock("playwright", () => {
  return {
    chromium: mockChromium,
    request: mockRequest,
  };
});

// Mock the fs module
jest.mock("node:fs", () => mockFs);

// Mock the path module
jest.mock("node:path", () => mockPath);

// Import the toolsHandler after mocking dependencies
import { handleToolCall } from "../src/toolsHandler";

describe("playwright_select unit tests", () => {
  beforeEach(() => {
    // Reset mocks before each test
    resetAllMocks();
  });

  it("should handle playwright_select tool", async () => {
    // First navigate to a page to ensure browser is initialized
    await handleToolCall(
      "playwright_navigate",
      { url: "https://example.com" },
      {}
    );

    const name = "playwright_select";
    const args = { selector: "select", value: "option1" };
    const server = {};

    const result = await handleToolCall(name, args, server);

    // Verify the waitForSelector and selectOption were called with the correct parameters
    expect(mockPage.waitForSelector).toHaveBeenCalledWith("select");
    expect(mockPage.selectOption).toHaveBeenCalledWith("select", "option1");

    // Verify the result
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe(`Selected select with: option1`);
  });
});
