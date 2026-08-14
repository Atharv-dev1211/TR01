import { Server as SocketIOServer, Socket } from 'socket.io';
import { SOCKET_EVENTS } from '../constants/events.js';

export class SocketService {
  private io: SocketIOServer | null = null;

  public init(io: SocketIOServer): void {
    this.io = io;

    this.io.on('connection', (socket: Socket) => {
      console.log(`[Socket.IO] Client connected: ${socket.id}`);

      socket.on('join_counter', (counterId: string) => {
        socket.join(`counter:${counterId}`);
        console.log(`[Socket.IO] Client ${socket.id} joined room counter:${counterId}`);
      });

      socket.on('join_service', (serviceId: string) => {
        socket.join(`service:${serviceId}`);
        console.log(`[Socket.IO] Client ${socket.id} joined room service:${serviceId}`);
      });

      socket.on('disconnect', () => {
        console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
      });

      socket.on('QUEUECRAFT_SOCKET_TEST', (data: any) => {
        console.log(`[Socket.IO] TEST EVENT received from client ${socket.id}:`, data);
        socket.emit('QUEUECRAFT_SOCKET_TEST_ACK', {
          status: 'ok',
          received: data,
          timestamp: new Date().toISOString(),
        });
      });
    });
  }

  /**
   * Broadcast real-time queue change event to all clients or specific rooms
   */
  public emitQueueUpdated(serviceId: string, payload: any): void {
    if (!this.io) return;
    this.io.emit(SOCKET_EVENTS.QUEUE_UPDATED, payload);
    this.io.to(`service:${serviceId}`).emit(SOCKET_EVENTS.QUEUE_UPDATED, payload);
  }

  public emitTokenCreated(token: any): void {
    if (!this.io) return;
    const payload = {
      tokenId: token.id,
      tokenNumber: token.token_number,
      serviceId: token.service_id,
      counterId: token.counter_id,
      status: token.status
    };
    this.io.emit(SOCKET_EVENTS.TOKEN_CREATED, payload);
    this.io.to(`service:${token.service_id}`).emit(SOCKET_EVENTS.TOKEN_CREATED, payload);
  }

  public emitTokenCalled(counterId: string, token: any): void {
    if (!this.io) return;
    const payload = {
      tokenId: token.id,
      tokenNumber: token.token_number,
      counterId: token.counter_id,
      status: token.status
    };
    this.io.emit(SOCKET_EVENTS.TOKEN_CALLED, payload);
    this.io.to(`counter:${counterId}`).emit(SOCKET_EVENTS.TOKEN_CALLED, payload);
  }

  public emitTokenCompleted(counterId: string, token: any): void {
    if (!this.io) return;
    const payload = {
      tokenId: token.id,
      tokenNumber: token.token_number,
      counterId: token.counter_id,
      status: token.status
    };
    this.io.emit(SOCKET_EVENTS.TOKEN_COMPLETED, payload);
    this.io.to(`counter:${counterId}`).emit(SOCKET_EVENTS.TOKEN_COMPLETED, payload);
  }

  public emitTokenCancelled(token: any): void {
    if (!this.io) return;
    const payload = {
      tokenId: token.id,
      tokenNumber: token.token_number,
      counterId: token.counter_id,
      status: token.status
    };
    this.io.emit(SOCKET_EVENTS.TOKEN_CANCELLED, payload);
    if (token.counter_id) {
      this.io.to(`counter:${token.counter_id}`).emit(SOCKET_EVENTS.TOKEN_CANCELLED, payload);
    }
    this.io.to(`service:${token.service_id}`).emit(SOCKET_EVENTS.TOKEN_CANCELLED, payload);
  }

  public emitWaitTimeUpdated(counterId: string, estimatedWaitTime: number): void {
    if (!this.io) return;
    const payload = { counterId, estimatedWaitTime };
    this.io.emit(SOCKET_EVENTS.WAIT_TIME_UPDATED, payload);
    this.io.to(`counter:${counterId}`).emit(SOCKET_EVENTS.WAIT_TIME_UPDATED, payload);
  }




  public emitTokenSkipped(counterId: string, token: any): void {
    if (!this.io) return;
    this.io.emit('TOKEN_SKIPPED', { counterId, token });
    this.io.to(`counter:${counterId}`).emit('TOKEN_SKIPPED', token);
  }

  public emitTokenHeld(counterId: string, token: any): void {
    if (!this.io) return;
    this.io.emit('TOKEN_HELD', { counterId, token });
    this.io.to(`counter:${counterId}`).emit('TOKEN_HELD', token);
  }

  public emitTokenResumed(counterId: string, token: any): void {
    if (!this.io) return;
    this.io.emit('TOKEN_RESUMED', { counterId, token });
    this.io.to(`counter:${counterId}`).emit('TOKEN_RESUMED', token);
  }

  public emitCounterStatusChanged(counterId: string, status: string): void {
    if (!this.io) return;
    this.io.emit('COUNTER_STATUS_CHANGED', { counterId, status });
  }
}

export const socketService = new SocketService();
