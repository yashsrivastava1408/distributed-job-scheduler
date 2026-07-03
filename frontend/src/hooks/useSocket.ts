import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';

let socket: Socket | null = null;

export const useSocket = () => {
  const { activeProject, accessToken } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!accessToken) {
      if (socket) {
        socket.disconnect();
        socket = null;
      }
      return;
    }

    if (!socket) {
      // Connect to backend (since frontend is served on port 5173 locally in dev and Nginx on port 80 in prod)
      // We fall back to window.location.origin or port 3000 in local dev
      const devMode = import.meta.env.DEV;
      const socketUrl = devMode ? 'http://localhost:3000' : window.location.origin;

      socket = io(socketUrl, {
        transports: ['websocket'],
      });

      socket.on('connect', () => {
        console.log('Connected to WebSocket server');
      });
    }

    if (activeProject) {
      const room = activeProject.id;
      socket.emit('subscribe:project', room);

      // Event listeners to invalidate React Query caches for real-time UI synchronization
      socket.on('job:updated', (data) => {
        console.log('WS: job:updated', data);
        queryClient.invalidateQueries({ queryKey: ['jobs'] });
        queryClient.invalidateQueries({ queryKey: ['project-metrics', activeProject.id] });
        queryClient.invalidateQueries({ queryKey: ['queue-stats'] });
        // If viewing specific job detail, invalidate that query as well
        if (data.id) {
          queryClient.invalidateQueries({ queryKey: ['job-detail', data.id] });
        }
      });

      socket.on('job:created', (data) => {
        console.log('WS: job:created', data);
        queryClient.invalidateQueries({ queryKey: ['jobs'] });
        queryClient.invalidateQueries({ queryKey: ['project-metrics', activeProject.id] });
        queryClient.invalidateQueries({ queryKey: ['queue-stats'] });
      });

      socket.on('queue:updated', (data) => {
        console.log('WS: queue:updated', data);
        queryClient.invalidateQueries({ queryKey: ['queues', activeProject.id] });
        queryClient.invalidateQueries({ queryKey: ['queue-stats'] });
      });

      socket.on('queue:deleted', (data) => {
        console.log('WS: queue:deleted', data);
        queryClient.invalidateQueries({ queryKey: ['queues', activeProject.id] });
        queryClient.invalidateQueries({ queryKey: ['queue-stats'] });
      });

      socket.on('worker:heartbeat', (data) => {
        console.log('WS: worker:heartbeat', data);
        queryClient.invalidateQueries({ queryKey: ['workers'] });
        // If viewing specific worker detail, invalidate it
        if (data.workerId) {
          queryClient.invalidateQueries({ queryKey: ['worker-detail', data.workerId] });
        }
      });

      socket.on('worker:updated', (data) => {
        console.log('WS: worker:updated', data);
        queryClient.invalidateQueries({ queryKey: ['workers'] });
      });

      return () => {
        if (socket) {
          socket.emit('unsubscribe:project', room);
          socket.off('job:updated');
          socket.off('job:created');
          socket.off('queue:updated');
          socket.off('queue:deleted');
          socket.off('worker:heartbeat');
          socket.off('worker:updated');
        }
      };
    }
  }, [activeProject, accessToken, queryClient]);
};
