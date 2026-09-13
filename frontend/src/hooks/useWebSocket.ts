import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = (import.meta.env as any).VITE_SOCKET_URL || 'http://localhost:3001';

interface Payload {
  payload_id: string;
  payload_data: any;
  received_at: string;
  webhook_id: string;
}

export function useWebSocket() {
  const [payloads, setPayloads] = useState<Payload[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const connect = (webhookId: string): void => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe_webhook', { webhook_id: webhookId });
      return;
    }

    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('subscribe_webhook', { webhook_id: webhookId });
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('subscribed', (data: { webhook_id: string }) => {
      console.log('Subscribed to webhook:', data.webhook_id);
    });

    socket.on('new_payload', (payload: Payload) => {
      setPayloads((prev) => [payload, ...prev]);
    });

    socket.on('error', (data: { error: string }) => {
      setError(data.error);
    });

    socket.on('payload_history', (data: { webhook_id: string; payloads: Payload[] }) => {
      setPayloads(data.payloads);
      setLoading(false);
    });
  };

  const disconnect = (webhookId: string): void => {
    if (socketRef.current) {
      socketRef.current.emit('unsubscribe_webhook', { webhook_id: webhookId });
    }
  };

  const getPayloadHistory = (webhookId: string, limit = 50): void => {
    setLoading(true);
    setError(null);
    if (socketRef.current) {
      socketRef.current.emit('get_payload_history', { webhook_id: webhookId, limit });
    }
  };

  const clearPayloads = (): void => {
    setPayloads([]);
  };

  const removePayload = (payloadId: string): void => {
    setPayloads((prev) => prev.filter((payload) => payload.payload_id !== payloadId));
  };

  return {
    payloads,
    isConnected,
    loading,
    error,
    connect,
    disconnect,
    getPayloadHistory,
    clearPayloads,
    setPayloads,
    removePayload
  };
}
