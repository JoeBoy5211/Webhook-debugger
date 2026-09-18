import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { initializeDatabase, pool } from './db';
import webhooksRouter from './routes/webhooks';
import automationRouter from './routes/automations';
import authRouter from './routes/auth';
import { errorHandler } from './middleware/errorHandler';
import { initializeWebSockets } from './sockets/webhookSocket';
import { startCleanupJob, cleanupExpiredPayloads } from './services/cleanupService';
import { createServer } from 'http';
import { authMiddleware, AuthRequest } from './middleware/authMiddleware';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Health check route
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date()
  });
});

// Auth routes (must be before webhook routes)
app.use('/api/auth', authRouter);
app.use('/api', authRouter);

// Webhook routes
app.use('/api', webhooksRouter);

// Automation rules
app.use('/api', automationRouter);

app.get('/api/admin/cleanup', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const deleted_count = await cleanupExpiredPayloads();
    console.log(`[audit] admin_cleanup`, { user_id: req.user?.user_id, at: new Date().toISOString(), deleted_count });
    res.json({ status: 'cleaned', deleted_count });
  } catch (error) {
    console.error('Admin cleanup failed:', error);
    res.status(500).json({ error: 'Failed to run cleanup', status: 500 });
  }
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize database and start server
async function startServer() {
  try {
    await initializeDatabase();
    startCleanupJob();
    const httpServer = createServer(app);
    const ioInstance = initializeWebSockets(httpServer, pool);
    
    // Set Socket.IO instance in webhooks router
    const { setSocketIO } = await import('./routes/webhooks');
    setSocketIO(ioInstance);
    
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`WebSocket server initialized`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
