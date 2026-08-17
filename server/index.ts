import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { seedDatabase } from './db/seed.js';
import { socketService } from './services/socketService.js';
import authRoutes from './routes/auth.js';
import staffQueueRoutes from './routes/staffQueue.js';
import adminRoutes from './routes/admin.js';
import queueRoutes from './routes/queue.js';
import studentRoutes from './routes/student.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  },
});

// Initialize SocketService gateway
socketService.init(io);

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Database & Seed Demo Data
try {
  seedDatabase();
} catch (err) {
  console.error('[Database] Failed to initialize/seed database:', err);
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/staff', staffQueueRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/student', studentRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'QueueCraft Staff Operations Module', timestamp: new Date().toISOString() });
});

// Serve frontend build in production
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(distPath, 'index.html'));
  }
});

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🚀 QueueCraft Staff Operations Module Server Running`);
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`🔐 Demo Staff Login: rudresh@queuecraft.edu / password123`);
    console.log(`==================================================`);
  });
}

export { app, server, io };
