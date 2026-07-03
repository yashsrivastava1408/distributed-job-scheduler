import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/job_scheduler',
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'access-secret-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'refresh-secret-change-me',
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },

  scheduler: {
    pollIntervalMs: parseInt(process.env.SCHEDULER_POLL_INTERVAL_MS || '5000', 10),
  },

  reaper: {
    pollIntervalMs: parseInt(process.env.REAPER_POLL_INTERVAL_MS || '15000', 10),
    staleThresholdMs: parseInt(process.env.REAPER_STALE_THRESHOLD_MS || '30000', 10),
  },
};
