import http from 'node:http';
import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/db';
import { env } from './config/env';
import { startSweeper } from './services/session.service';
import { createSocketServer } from './sockets';
import { logger } from './utils/logger';

async function bootstrap() {
  await connectDatabase();

  const app = createApp();
  const server = http.createServer(app);
  createSocketServer(server);
  const sweeper = startSweeper();

  server.listen(env.PORT, () => {
    logger.info(`PROCTORA API listening on http://localhost:${env.PORT}`);
    logger.info(`Allowed client origin: ${env.CLIENT_URL}`);
  });

  const shutdown = async (signal: string) => {
    logger.warn(`${signal} received, shutting down.`);
    clearInterval(sweeper);
    server.close();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection:', reason));
}

bootstrap().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
