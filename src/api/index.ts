import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import { requestIdMiddleware } from './middleware/requestId';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth';
import { organizationsRouter } from './routes/organizations';
import { projectsRouter } from './routes/projects';
import { queuesRouter } from './routes/queues';
import { jobsRouter } from './routes/jobs';
import { workersRouter } from './routes/workers';
import { dlqRouter } from './routes/dlq';
import { schedulerService } from './services/scheduler.service';
import { reaperService } from './services/reaper.service';
import { socketService } from './services/socket.service';
import { createLogger } from '../shared/logger';

const logger = createLogger('api');
const app = express();

// ─── Global Middleware ──────────────────────────────────────────────

app.use(helmet());
app.use(cors({ origin: config.cors.origin, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('short'));
app.use(requestIdMiddleware);

// ─── Internal Event Forwarding Route ─────────────────────────────────
const internalRouter = express.Router();
internalRouter.post('/event', (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== (process.env.JWT_ACCESS_SECRET || 'internal-secret')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { type, event, data, projectId } = req.body;
  if (type === 'project' && projectId) {
    socketService.broadcastToProject(projectId, event, data);
  } else if (type === 'global') {
    socketService.broadcastGlobal(event, data);
  }
  res.json({ success: true });
});

app.use('/api/v1/internal', internalRouter);

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/organizations', organizationsRouter);
app.use('/api/v1/projects', projectsRouter);
app.use('/api/v1/queues', queuesRouter);
app.use('/api/v1/jobs', jobsRouter);
app.use('/api/v1/workers', workersRouter);
app.use('/api/v1/dlq', dlqRouter);

// ─── Health Check ───────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Error Handler (must be last) ───────────────────────────────────

app.use(errorHandler);

// ─── Start Server ───────────────────────────────────────────────────

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, 'API server started');

  // Initialize Socket.io WebSocket server
  socketService.init(server, config.cors.origin);

  // Start background daemons
  schedulerService.start(config.scheduler.pollIntervalMs);
  reaperService.start(config.reaper.pollIntervalMs, config.reaper.staleThresholdMs);
});

// ─── Graceful Shutdown ──────────────────────────────────────────────

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down API server');
  schedulerService.stop();
  reaperService.stop();
  server.close(() => {
    logger.info('API server stopped');
    process.exit(0);
  });
  // Force exit after 10s
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
