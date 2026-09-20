import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { allowedOrigins, env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { generalLimiter } from './middleware/rateLimit';
import routes from './routes';
import { logger } from './utils/logger';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  // Helmet's defaults are correct for a JSON-only API. Cross-Origin-Resource-Policy
  // only gates `no-cors` embeds, and nothing embeds this API as a subresource:
  // the browser talks to it with fetch and Socket.io, both of which are governed
  // by the CORS allow-list below instead.
  app.use(helmet());

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(generalLimiter);

  if (!env.isProduction) {
    app.use((req, _res, next) => {
      logger.debug(`${req.method} ${req.originalUrl}`);
      next();
    });
  }

  app.get('/', (_req, res) => {
    res.json({
      success: true,
      data: { name: 'PROCTORA API', version: '1.0.0', docs: '/api/health' },
    });
  });

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
