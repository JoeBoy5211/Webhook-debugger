import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { Pool } from 'pg';

export function initializeWebSockets(httpServer: HTTPServer, pool: Pool): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // EVENT 2: subscribe_webhook
    socket.on('subscribe_webhook', async (data: { webhook_id: string }) => {
      const { webhook_id } = data;

      try {
        // Validate webhook exists
        const webhookCheck = await pool.query(
          'SELECT id FROM webhooks WHERE id = $1',
          [webhook_id]
        );

        if (webhookCheck.rows.length === 0) {
          socket.emit('error', { error: 'Webhook not found', status: 404 });
          return;
        }

        socket.join(`webhook:${webhook_id}`);
        socket.emit('subscribed', { webhook_id, message: 'Subscribed' });
        console.log(`Client ${socket.id} subscribed to webhook ${webhook_id}`);
      } catch (error) {
        console.error('Error subscribing to webhook:', error);
        socket.emit('error', { error: 'Failed to subscribe', status: 500 });
      }
    });

    // EVENT 3: unsubscribe_webhook
    socket.on('unsubscribe_webhook', (data: { webhook_id: string }) => {
      const { webhook_id } = data;
      socket.leave(`webhook:${webhook_id}`);
      socket.emit('unsubscribed', { webhook_id });
      console.log(`Client ${socket.id} unsubscribed from webhook ${webhook_id}`);
    });

    // EVENT 4: get_payload_history
    socket.on('get_payload_history', async (data: { webhook_id: string; limit?: number }) => {
      const { webhook_id, limit = 50 } = data;

      try {
        const result = await pool.query(
          'SELECT * FROM payloads WHERE webhook_id = $1 ORDER BY received_at DESC LIMIT $2',
          [webhook_id, limit]
        );

        socket.emit('payload_history', { webhook_id, payloads: result.rows });
      } catch (error) {
        console.error('Error fetching payload history:', error);
        socket.emit('error', { error: 'Failed to fetch payload history', status: 500 });
      }
    });

    // EVENT 5: disconnect
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
}
