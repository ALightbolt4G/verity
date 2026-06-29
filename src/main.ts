import { McpServer } from './mcp/server.js';

const server = new McpServer();

server.start().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});

const shutdown = async () => {
  try {
    await server.stop();
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
