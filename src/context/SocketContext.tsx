import React, { createContext, useContext, useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { socketService } from '../socket';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  testStatus: 'idle' | 'pending' | 'success' | 'error';
  triggerSocketTest: () => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  testStatus: 'idle',
  triggerSocketTest: () => { },
});

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [socket, setSocket] = useState<Socket | null>(null);
  const { counter } = useAuth();

  useEffect(() => {
    // Inbound connection using clean socket connection module
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
        console.error('[SocketProvider] Live dynamic connection error:', err);
        setTestStatus('error');
      }
    );

    setSocket(socketInstance);

    // Register responder acknowledgement listener for QUEUECRAFT_SOCKET_TEST
    const handleTestAck = (payload: any) => {
      console.log('[SocketProvider] Received QUEUECRAFT_SOCKET_TEST_ACK:', payload);
      setTestStatus('success');

      // Revert test indicator color/text back to normal after some seconds
      setTimeout(() => {
        setTestStatus('idle');
      }, 4000);
    };

    socketService.on('QUEUECRAFT_SOCKET_TEST_ACK', handleTestAck);

    return () => {
      socketService.off('QUEUECRAFT_SOCKET_TEST_ACK', handleTestAck);
      socketService.disconnect();
    };
  }, [counter?.id, counter?.service_id]);

  const triggerSocketTest = () => {
    setTestStatus('pending');
    socketService.sendSocketTest();
  };

  return (
    <SocketContext.Provider value={{ socket, isConnected, testStatus, triggerSocketTest }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
