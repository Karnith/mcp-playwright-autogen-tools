# Playwright MCP Server 🎭

[![smithery badge](https://smithery.ai/badge/@executeautomation/playwright-mcp-server)](https://smithery.ai/server/@executeautomation/playwright-mcp-server)

A Model Context Protocol server that provides browser automation capabilities using Playwright. This server enables LLMs to interact with web pages, take screenshots, and execute JavaScript in a real browser environment.

<a href="https://glama.ai/mcp/servers/yh4lgtwgbe"><img width="380" height="200" src="https://glama.ai/mcp/servers/yh4lgtwgbe/badge" alt="mcp-playwright MCP server" /></a>

## Screenshot
![Playwright + Claude](image/playwright_claude.png)

## [Documentation](https://executeautomation.github.io/mcp-playwright/) | [API reference](https://executeautomation.github.io/mcp-playwright/docs/playwright-web/Supported-Tools)

## Installation

You can install and run the server in multiple ways:

### NPM Installation

Using npm:
```bash
npm install -g @executeautomation/playwright-mcp-server
```

Using mcp-get:
```bash
npx @michaellatman/mcp-get@latest install @executeautomation/playwright-mcp-server
```

Using Smithery:
```bash
npx -y @smithery/cli install @executeautomation/playwright-mcp-server --client claude
```

### Docker Installation

The server can also be run using Docker Compose, which provides an isolated environment with all necessary dependencies.

1. Clone the repository:
```bash
git clone https://github.com/executeautomation/mcp-playwright.git
cd mcp-playwright
```

2. Configure environment variables (optional):
```bash
# Copy the example .env file
cp .env.example .env

# Edit the .env file to customize settings
# Default port is 3338
```

3. Build and start the container:
```bash
docker-compose up -d
```

4. View logs:
```bash
docker-compose logs -f
```

5. Stop the container:
```bash
docker-compose down
```

The server will be accessible at `http://localhost:3338/sse` (or your configured port) when running in Docker.

## Configuration

### Multi-Session Support

The server now supports multiple concurrent connections with isolated browser sessions:

- Each client connection gets its own dedicated browser instance
- Browser state and tool state are isolated between connections
- Sessions are automatically cleaned up after 30 minutes of inactivity
- Maximum concurrent sessions can be configured (default: 10)

You can configure the session behavior through environment variables:

```bash
# Maximum number of concurrent sessions
MAX_SESSIONS=10

# Session timeout in milliseconds (default: 30 minutes)
SESSION_TIMEOUT=1800000
```

When running with Docker, add these variables to your `.env` file or docker-compose.yml:

```yaml
environment:
  - MAX_SESSIONS=10
  - SESSION_TIMEOUT=1800000
```

### Connection Limitations

While the server now supports multiple concurrent sessions, please note:

- Each session consumes significant system resources (memory and CPU)
- Browser instances are launched on-demand and cleaned up automatically
- Consider your server's resource capacity when setting MAX_SESSIONS
- For high-load scenarios, consider running multiple server instances behind a load balancer

### Claude Desktop Configuration

Here's the Claude Desktop configuration to use the Playwright server:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@executeautomation/playwright-mcp-server"]
    }
  }
}
```

### Docker Environment Variables

When running with Docker, you can configure the following environment variables in the `.env` file:

- `PORT`: The port number for the SSE server (default: 3338)
- `NODE_ENV`: The Node.js environment (default: production)
- `PLAYWRIGHT_BROWSERS_PATH`: Path to Playwright browsers in the container (default: /ms-playwright)

## Testing

This project uses Jest for testing. The tests are located in the `src/__tests__` directory.

### Running Tests

You can run the tests using one of the following commands:

```bash
# Run tests using the custom script (with coverage)
node run-tests.cjs

# Run tests using npm scripts
npm test           # Run tests without coverage
npm run test:coverage  # Run tests with coverage
npm run test:custom    # Run tests with custom script (same as node run-tests.cjs)
```

The test coverage report will be generated in the `coverage` directory.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=executeautomation/mcp-playwright&type=Date)](https://star-history.com/#executeautomation/mcp-playwright&Date)
