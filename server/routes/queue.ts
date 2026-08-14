import { Router, Response } from 'express';
import { getDb } from '../db/database.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { queueEngine } from '../services/queueEngine.js';
import { socketService } from '../services/socketService.js';

const router = Router();

// Apply authentication middleware to all queue routes
router.use(authenticateToken);

// POST /api/queue/tokens (CREATE TOKEN / JOIN QUEUE)
router.post('/tokens', (req: AuthRequest, res: Response) => {
  try {
    const { service_id, priority = 'NORMAL', notes, student_name, student_email } = req.body;

    if (!service_id) {
      res.status(400).json({ error: 'service_id is required' });
      return;
    }

    // Determine student info based on authenticated user role
    let sId: string | null = null;
    let sName: string;
    let sEmail: string | null = null;

    if (req.user?.role === 'STUDENT') {
      sId = req.user.id;
      sName = req.user.name;
      sEmail = req.user.email;
    } else {
      // For staff/admin, allow creating tokens on behalf of students
      if (!student_name) {
        res.status(400).json({ error: 'student_name is required when creating on behalf of a student' });
        return;
      }
      sName = student_name;
      sEmail = student_email || null;
    }

    const result = queueEngine.createToken({
      student_id: sId,
      student_name: sName,
      student_email: sEmail,
      service_id,
      priority,
      notes
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    // Emit real-time queue update event
    socketService.emitQueueUpdated(service_id, {
      action: 'CREATE',
      tokenId: result.token?.id,
      tokenNumber: result.token?.token_number
    });

    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error creating queue token' });
  }
});

// GET /api/queue/tokens/:tokenId (GET TOKEN DETAILS & LIVE POSITION)
router.get('/tokens/:tokenId', (req: AuthRequest, res: Response) => {
  try {
    const tokenId = String(req.params.tokenId);
    const db = getDb();

    const token = db.prepare(`
      SELECT t.*, s.name as service_name, s.code as service_code, c.name as counter_name
      FROM tokens t
      JOIN services s ON t.service_id = s.id
      LEFT JOIN counters c ON t.counter_id = c.id
      WHERE t.id = ?
    `).get(tokenId) as any;

    if (!token) {
      res.status(404).json({ error: 'Token not found' });
      return;
    }

    // Check permission: Student can only view their own token details
    if (req.user?.role === 'STUDENT' && token.student_id !== req.user.id) {
      res.status(403).json({ error: 'Forbidden: Cannot access details of another student\'s token' });
      return;
    }

    const details = queueEngine.getTokenPositionDetails(tokenId);

    res.json({
      ...token,
      position: details?.position ?? -1,
      peopleAhead: details?.peopleAhead ?? 0,
      estimatedWaitMinutes: details?.estimatedWaitMinutes ?? 0
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error retrieving token details' });
  }
});

// POST /api/queue/tokens/:tokenId/cancel (CANCEL TOKEN)
router.post('/tokens/:tokenId/cancel', (req: AuthRequest, res: Response) => {
  try {
    const tokenId = String(req.params.tokenId);
    const db = getDb();

    const token = db.prepare('SELECT * FROM tokens WHERE id = ?').get(tokenId) as any;
    if (!token) {
      res.status(404).json({ error: 'Token not found' });
      return;
    }

    // Check permission: Student can only cancel their own token
    if (req.user?.role === 'STUDENT' && token.student_id !== req.user.id) {
      res.status(403).json({ error: 'Forbidden: Cannot cancel another student\'s token' });
      return;
    }

    const result = queueEngine.cancelToken(tokenId);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    // Emit real-time queue update event
    socketService.emitQueueUpdated(token.service_id, {
      action: 'CANCEL',
      tokenId,
      tokenNumber: token.token_number
    });

    res.json({
      message: `Token ${token.token_number} cancelled successfully`,
      token: result.token
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error cancelling token' });
  }
});

// GET /api/queue/services/:serviceId/waiting (GET WAITING QUEUE LIST WITH POSITION METRICS)
router.get('/services/:serviceId/waiting', (req: AuthRequest, res: Response) => {
  try {
    const serviceId = String(req.params.serviceId);
    const waitingQueue = queueEngine.getWaitingQueueWithDetails(serviceId);
    res.json(waitingQueue);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error fetching waiting queue' });
  }
});

// GET /api/queue/services/:serviceId/stats (GET QUEUE STATS FOR SERVICE)
router.get('/services/:serviceId/stats', (req: AuthRequest, res: Response) => {
  try {
    const serviceId = String(req.params.serviceId);
    const db = getDb();

    // Verify service exists
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId);
    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }

    const waitingQueue = queueEngine.getWaitingQueueWithDetails(serviceId);
    
    // Average wait calculation (using the dynamic engine helper)
    const avgServiceTime = (queueEngine as any).getAverageServiceTime ? (queueEngine as any).getAverageServiceTime(serviceId) : 4.5;
    
    // Count of open counters for this service
    const openCountersCount = (db.prepare(`
      SELECT COUNT(*) as cnt FROM counters WHERE service_id = ? AND status = 'OPEN'
    `).get(serviceId) as any).cnt;

    res.json({
      queue_length: waitingQueue.length,
      waiting_count: waitingQueue.length,
      open_counters: openCountersCount,
      avg_service_time_minutes: avgServiceTime,
      total_estimated_wait_minutes: waitingQueue.length > 0 ? waitingQueue[waitingQueue.length - 1].estimatedWaitMinutes : 0
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error fetching queue stats' });
  }
});

export default router;
