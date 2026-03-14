// File: server/src/api/app.ts

import express           from 'express';
import cors              from 'cors';
import helmet            from 'helmet';
import morgan            from 'morgan';
import { env }           from '../shared/config/env';
import { globalLimiter } from './middleware/rateLimiter';
import { errorHandler }  from './middleware/errorHandler';
import { registerRoutes } from './routes/index';

export function createApiApp(): express.Express {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan(env.IS_DEV ? 'dev' : 'combined'));
  app.use(globalLimiter);
  registerRoutes(app);
  app.use(errorHandler); // must be last
  return app;
}
