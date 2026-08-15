import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { socketService } from '../socket';
import { SOCKET_EVENTS } from '../constants/events';
import { ToastMessage, Token, Counter } from '../types';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  testStatus: 'idle' | 'pending' | 'success' | 'error';
  triggerSocketTest: () => void;
  toasts: ToastMessage[];
  addToast: (type: 'success' | 'error' | 'info' | 'warning', title: string, message: string) => void;
  removeToast: (id: string) => void;

  // Real-Time Queue Status Panel States & Actions
  activeToken: Token | null;
  activeTokenLoading: boolean;
  waitTime: number | null;
  fetchActiveToken: () => Promise<void>;
  bookToken: (serviceId: string) => Promise<void>;
  cancelToken: (tokenId: string) => Promise<void>;
  dismissActiveToken: () => void;

  // Real-Time Counter Status Displays
  counters: Counter[];
  countersLoading: boolean;
  fetchCounters: () => Promise<void>;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  testStatus: 'idle',
  triggerSocketTest: () => { },
  toasts: [],
  addToast: () => { },
  removeToast: () => { },

  activeToken: null,
  activeTokenLoading: false,
  waitTime: null,
  fetchActiveToken: async () => { },
  bookToken: async () => { },
  cancelToken: async () => { },
  dismissActiveToken: () => { },

  counters: [],
  countersLoading: false,
  fetchCounters: async () => { },
});

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const { user, counter } = useAuth();

  // Active Token & waitTime States
  const [activeToken, setActiveToken] = useState<Token | null>(null);
  const [activeTokenLoading, setActiveTokenLoading] = useState<boolean>(false);
  const [waitTime, setWaitTime] = useState<number | null>(null);

  // Counter Status Display States
  const [counters, setCounters] = useState<Counter[]>([]);
  const [countersLoading, setCountersLoading] = useState<boolean>(false);

  const activeTokenRef = React.useRef<Token | null>(null);
  useEffect(() => {
    activeTokenRef.current = activeToken;
  }, [activeToken]);

  const addToast = (type: 'success' | 'error' | 'info' | 'warning', title: string, message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const fetchCounters = useCallback(async () => {
    if (!user || user.role !== 'STUDENT') return;
    setCountersLoading(true);
    try {
      const storedToken = localStorage.getItem('qc_token');
      if (!storedToken) return;

      const headers = { Authorization: `Bearer ${storedToken}` };
      const res = await fetch('/api/student/counters', { headers });
      if (res.ok) {
        const data = await res.json();
        setCounters(data);
      }
    } catch (err) {
      console.error('[SocketProvider] Failed to fetch counters:', err);
    } finally {
      setCountersLoading(false);
    }
  }, [user]);

  const fetchActiveToken = useCallback(async () => {
    if (!user || user.role !== 'STUDENT') return;
    setActiveTokenLoading(true);
    try {
      const storedToken = localStorage.getItem('qc_token');
      if (!storedToken) return;

      const headers = { Authorization: `Bearer ${storedToken}` };
      const res = await fetch('/api/student/active-token', { headers });
      if (res.ok) {
        const data = await res.json();
        setActiveToken((prev) => {
          if (data === null) {
            if (prev && (prev.status === 'COMPLETED' || prev.status === 'CANCELLED' || prev.status === 'SKIPPED')) {
              return prev;
            }
          }
          return data;
        });
        if (data) {
          setWaitTime(data.estimated_wait !== undefined ? data.estimated_wait : data.queue_position * 4.5);
        } else {
          setActiveToken((prev) => {
            if (prev && (prev.status === 'COMPLETED' || prev.status === 'CANCELLED' || prev.status === 'SKIPPED')) {
              setWaitTime(null);
            }
            return prev;
          });
        }
      }
    } catch (err) {
      console.error('[SocketProvider] Failed to fetch active token:', err);
    } finally {
      setActiveTokenLoading(false);
    }
  }, [user]);

  const bookToken = async (serviceId: string) => {
    if (!user) return;
    setActiveTokenLoading(true);
    try {
      const storedToken = localStorage.getItem('qc_token');
      const res = await fetch('/api/student/tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${storedToken}`,
        },
        body: JSON.stringify({ serviceId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to book token');
      }

      await fetchActiveToken();
    } catch (err: any) {
      alert(err.message || 'Booking failed');
    } finally {
      setActiveTokenLoading(false);
    }
  };

  const cancelToken = async (tokenId: string) => {
    if (!user) return;
    setActiveTokenLoading(true);
    try {
      const storedToken = localStorage.getItem('qc_token');
      const res = await fetch(`/api/student/tokens/${tokenId}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${storedToken}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to cancel token');
      }

      setActiveToken((prev) => {
        if (prev && prev.id === tokenId) {
          return { ...prev, status: 'CANCELLED' };
        }
        return prev;
      });
      setWaitTime(null);
    } catch (err: any) {
      alert(err.message || 'Cancellation failed');
    } finally {
      setActiveTokenLoading(false);
    }
  };

  const dismissActiveToken = () => {
    setActiveToken(null);
    setWaitTime(null);
  };

  // Trigger active token & counters fetch on mount or user changes
  useEffect(() => {
    if (user && user.role === 'STUDENT') {
      fetchActiveToken();
      fetchCounters();
    } else {
      setActiveToken(null);
      setWaitTime(null);
      setCounters([]);
    }
  }, [user, fetchActiveToken, fetchCounters]);

  useEffect(() => {
    if (!user) {
      setSocket(null);
      setIsConnected(false);
      return;
    }

    const socketInstance = socketService.connect(
      // onConnect
      () => {
        setIsConnected(true);
        if (counter?.id) {
          socketService.emit('join_counter', counter.id);
        }
        if (counter?.service_id) {
          socketService.emit('join_service', counter.service_id);
        }
      },
      // onDisconnect
      () => {
        setIsConnected(false);
      },
      // onError
      (err) => {
        console.error('[SocketProvider] Connection error:', err);
        setTestStatus('error');
      }
    );

    setSocket(socketInstance);

    // Register active notification events
    const handleTokenCreated = (payload: any) => {
      console.log('[Socket Listener] TOKEN_CREATED payload:', payload);
      fetchCounters();
      if (user && payload.studentId === user.id) {
        fetchActiveToken();
        addToast(
          'success',
          'Token Created',
          `Your token ${payload.tokenNumber} has been created.`
        );
      } else if (user && user.role === 'STAFF' && counter && payload.serviceId === counter.service_id) {
        addToast(
          'info',
          'Token Added',
          `Token ${payload.tokenNumber} has joined your service queue.`
        );
      }
    };

    const handleTokenCalled = (payload: any) => {
      console.log('[Socket Listener] TOKEN_CALLED payload:', payload);
      setCounters((prev) =>
        prev.map((c) =>
          c.id === payload.counterId
            ? { ...c, current_token_number: payload.tokenNumber }
            : c
        )
      );
      fetchCounters();

      if (user && payload.studentId === user.id) {
        setActiveToken((prev) => {
          if (prev && prev.id === payload.tokenId) {
            return {
              ...prev,
              status: 'SERVING',
              counter_id: payload.counterId,
              counter_name: payload.counterName,
            };
          }
          return prev;
        });
        addToast(
          'success',
          'Your Turn',
          `Token ${payload.tokenNumber} is now being served. Please proceed to ${payload.counterName}.`
        );
      }
    };

    const handleTokenCompleted = (payload: any) => {
      console.log('[Socket Listener] TOKEN_COMPLETED payload:', payload);
      setCounters((prev) =>
        prev.map((c) =>
          c.id === payload.counterId
            ? { ...c, current_token_number: null }
            : c
        )
      );
      fetchCounters();

      if (user && payload.studentId === user.id) {
        setActiveToken((prev) => {
          if (prev && prev.id === payload.tokenId) {
            return {
              ...prev,
              status: 'COMPLETED',
            };
          }
          return prev;
        });
        addToast(
          'success',
          'Service Completed',
          `Token ${payload.tokenNumber} has been completed.`
        );
      }
    };

    const handleTokenCancelled = (payload: any) => {
      console.log('[Socket Listener] TOKEN_CANCELLED payload:', payload);
      if (payload.counterId) {
        setCounters((prev) =>
          prev.map((c) =>
            c.id === payload.counterId
              ? { ...c, current_token_number: null }
              : c
          )
        );
      }
      fetchCounters();

      if (user && payload.studentId === user.id) {
        setActiveToken((prev) => {
          if (prev && prev.id === payload.tokenId) {
            return {
              ...prev,
              status: 'CANCELLED',
            };
          }
          return prev;
        });
        addToast(
          'error',
          'Token Cancelled',
          `Your token ${payload.tokenNumber} has been cancelled.`
        );
      } else if (user && user.role === 'STAFF' && counter && payload.counterId === counter.id) {
        addToast(
          'warning',
          'Token Cancelled',
          `Token ${payload.tokenNumber} was cancelled by the student.`
        );
      }
    };

    const handleQueueUpdated = (payload: any) => {
      console.log('[Socket Listener] QUEUE_UPDATED:', payload);
      fetchCounters();
      const currentToken = activeTokenRef.current;
      if (currentToken && currentToken.status === 'WAITING' && payload.serviceId === currentToken.service_id) {
        fetchActiveToken();
      }
    };

    const handleWaitTimeUpdated = (payload: any) => {
      console.log('[Socket Listener] WAIT_TIME_UPDATED:', payload);
      setCounters((prev) =>
        prev.map((c) =>
          c.id === payload.counterId
            ? { ...c, estimated_wait_time: payload.estimatedWaitTime }
            : c
        )
      );
      fetchCounters();
      const currentToken = activeTokenRef.current;
      if (currentToken && currentToken.counter_id === payload.counterId) {
        setWaitTime(payload.estimatedWaitTime);
      }
    };

    const handleCounterStatusChanged = (payload: any) => {
      console.log('[Socket Listener] COUNTER_STATUS_CHANGED payload:', payload);
      setCounters((prev) =>
        prev.map((c) =>
          c.id === payload.counterId
            ? { ...c, status: payload.status }
            : c
        )
      );
      fetchCounters();
    };

    const handleTestAck = (payload: any) => {
      console.log('[SocketProvider] Received QUEUECRAFT_SOCKET_TEST_ACK:', payload);
      setTestStatus('success');
      setTimeout(() => {
        setTestStatus('idle');
      }, 4000);
    };

    socketService.on(SOCKET_EVENTS.TOKEN_CREATED, handleTokenCreated);
    socketService.on(SOCKET_EVENTS.TOKEN_CALLED, handleTokenCalled);
    socketService.on(SOCKET_EVENTS.TOKEN_COMPLETED, handleTokenCompleted);
    socketService.on(SOCKET_EVENTS.TOKEN_CANCELLED, handleTokenCancelled);
    socketService.on(SOCKET_EVENTS.QUEUE_UPDATED, handleQueueUpdated);
    socketService.on(SOCKET_EVENTS.WAIT_TIME_UPDATED, handleWaitTimeUpdated);
    socketService.on('COUNTER_STATUS_CHANGED', handleCounterStatusChanged);
    socketService.on('QUEUECRAFT_SOCKET_TEST_ACK', handleTestAck);

    return () => {
      socketService.off(SOCKET_EVENTS.TOKEN_CREATED, handleTokenCreated);
      socketService.off(SOCKET_EVENTS.TOKEN_CALLED, handleTokenCalled);
      socketService.off(SOCKET_EVENTS.TOKEN_COMPLETED, handleTokenCompleted);
      socketService.off(SOCKET_EVENTS.TOKEN_CANCELLED, handleTokenCancelled);
      socketService.off(SOCKET_EVENTS.QUEUE_UPDATED, handleQueueUpdated);
      socketService.off(SOCKET_EVENTS.WAIT_TIME_UPDATED, handleWaitTimeUpdated);
      socketService.off('COUNTER_STATUS_CHANGED', handleCounterStatusChanged);
      socketService.off('QUEUECRAFT_SOCKET_TEST_ACK', handleTestAck);
      socketService.disconnect();
    };
  }, [user, counter?.id, counter?.service_id, fetchActiveToken, fetchCounters]);

  const triggerSocketTest = () => {
    setTestStatus('pending');
    socketService.sendSocketTest();
  };

  return (
    <SocketContext.Provider value={{
      socket,
      isConnected,
      testStatus,
      triggerSocketTest,
      toasts,
      addToast,
      removeToast,
      activeToken,
      activeTokenLoading,
      waitTime,
      fetchActiveToken,
      bookToken,
      cancelToken,
      dismissActiveToken,
      counters,
      countersLoading,
      fetchCounters
    }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
