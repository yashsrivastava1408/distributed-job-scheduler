import { Server } from 'socket.io';
import { createLogger } from '../../shared/logger';

const logger = createLogger('socket');

export class SocketService {
  private io: Server | null = null;
  private apiBaseUrl: string = process.env.API_INTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`;

  /** Initialize the Socket.io server */
  init(server: any, corsOrigin: string) {
    this.io = new Server(server, {
      cors: {
        origin: corsOrigin,
        credentials: true,
      },
    });

    this.io.on('connection', (socket) => {
      logger.debug({ socketId: socket.id }, 'Socket client connected');

      // Join a project room for tenant-scoped updates
      socket.on('subscribe:project', (projectId: string) => {
        if (projectId) {
          socket.join(`project:${projectId}`);
          logger.debug({ socketId: socket.id, projectId }, 'Subscribed to project room');
        }
      });

      // Leave a project room
      socket.on('unsubscribe:project', (projectId: string) => {
        if (projectId) {
          socket.leave(`project:${projectId}`);
          logger.debug({ socketId: socket.id, projectId }, 'Unsubscribed from project room');
        }
      });

      socket.on('disconnect', () => {
        logger.debug({ socketId: socket.id }, 'Socket client disconnected');
      });
    });

    logger.info('WebSocket (Socket.io) server initialized');
  }

  /** Broadcast to a project-specific room */
  broadcastToProject(projectId: string, event: string, data: any) {
    if (this.io) {
      this.io.to(`project:${projectId}`).emit(event, data);
      logger.debug({ projectId, event }, 'Broadcasted project event locally');
    } else {
      this.forwardToApi('project', { projectId, event, data });
    }
  }

  /** Broadcast to all connected clients */
  broadcastGlobal(event: string, data: any) {
    if (this.io) {
      this.io.emit(event, data);
      logger.debug({ event }, 'Broadcasted global event locally');
    } else {
      this.forwardToApi('global', { event, data });
    }
  }

  /** Forward event to the API server over HTTP when running in worker process */
  private async forwardToApi(type: 'project' | 'global', payload: any) {
    try {
      const url = `${this.apiBaseUrl}/api/v1/internal/event`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.JWT_ACCESS_SECRET || 'internal-secret',
        },
        body: JSON.stringify({ type, ...payload }),
      });
      if (!response.ok) {
        logger.warn({ status: response.status, event: payload.event }, 'Failed to forward socket event to API');
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message, event: payload.event }, 'Error forwarding socket event to API');
    }
  }
}

export const socketService = new SocketService();
