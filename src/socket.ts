import { io, Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from './constants/events';

export class SocketService {
    private socket: Socket | null = null;
    private isConnected: boolean = false;
    private listeners: Map<string, Array<(...args: any[]) => void>> = new Map();

    public getSocket(): Socket | null {
        return this.socket;
    }

    public getIsConnected(): boolean {
        return this.isConnected;
    }

    /**
     * Initialize and connect socket client to window.location.origin
     */
    public connect(
        onConnect?: () => void,
        onDisconnect?: () => void,
        onError?: (error: Error) => void
    ): Socket {
        if (this.socket) {
            return this.socket;
        }

        // Connect to same origin host, Vite proxy redirects ws requests to port 5000 in dev mode
        this.socket = io(window.location.origin, {
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 10000,
        });

        this.socket.on('connect', () => {
            this.isConnected = true;
            console.log(`[SocketService] Connection established: ${this.socket?.id}`);
            if (onConnect) onConnect();

            // Minimal frontend listeners for the 6 core real-time events
            const eventsToListen = [
                SOCKET_EVENTS.TOKEN_CREATED,
                SOCKET_EVENTS.TOKEN_CALLED,
                SOCKET_EVENTS.TOKEN_COMPLETED,
                SOCKET_EVENTS.TOKEN_CANCELLED,
                SOCKET_EVENTS.QUEUE_UPDATED,
                SOCKET_EVENTS.WAIT_TIME_UPDATED
            ];

            eventsToListen.forEach(eventName => {
                // remove existing before adding to avoid duplicates on reconnect
                this.socket?.off(eventName);
                this.socket?.on(eventName, (payload: any) => {
                    console.log(`[Real-Time Event] ${eventName}:`, payload);
                });
            });

            // Ensure cached listeners are active
            this.listeners.forEach((callbacks, event) => {
                callbacks.forEach((cb) => {
                    this.socket?.off(event, cb); // prevent duplicating
                    this.socket?.on(event, cb);
                });
            });
        });

        this.socket.on('disconnect', (reason: string) => {
            this.isConnected = false;
            console.log(`[SocketService] Disconnected. Reason: ${reason}`);
            if (onDisconnect) onDisconnect();
        });

        this.socket.on('connect_error', (err: Error) => {
            console.error('[SocketService] Connection error:', err);
            if (onError) onError(err);
        });

        this.socket.on('error', (err: any) => {
            console.error('[SocketService] General error:', err);
            if (onError) onError(new Error(err));
        });

        return this.socket;
    }

    /**
     * Cleanly disconnect the socket connection
     */
    public disconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
            console.log('[SocketService] Socket connection cleanly closed.');
        }
    }

    /**
     * Emit event safely
     */
    public emit(event: string, data?: any): void {
        if (!this.socket) {
            console.warn(`[SocketService] Ignored emit for "${event}" - socket is not connected.`);
            return;
        }
        this.socket.emit(event, data);
    }

    /**
     * Register a persistent listener callback
     */
    public on(event: string, callback: (...args: any[]) => void): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)?.push(callback);

        if (this.socket) {
            this.socket.on(event, callback);
        }
    }

    /**
     * Deregister callback listener
     */
    public off(event: string, callback: (...args: any[]) => void): void {
        const callbacks = this.listeners.get(event) || [];
        const index = callbacks.indexOf(callback);
        if (index !== -1) {
            callbacks.splice(index, 1);
        }

        if (this.socket) {
            this.socket.off(event, callback);
        }
    }

    /**
     * Sends the development real-time test event
     */
    public sendSocketTest(): void {
        const payload = {
            timestamp: new Date().toISOString(),
            developer: 'Pranay',
            clientHost: window.location.origin
        };
        console.log('[SocketService] Emitting QUEUECRAFT_SOCKET_TEST:', payload);
        this.emit('QUEUECRAFT_SOCKET_TEST', payload);
    }
}

export const socketService = new SocketService();
