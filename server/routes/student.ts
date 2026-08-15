import { Router, Response } from 'express';
import { getDb } from '../db/database.js';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Apply auth & STUDENT role restriction to all student endpoints
router.use(authenticateToken);
router.use(requireRole(['STUDENT']));

// GET /api/student/services
// Returns available services from database
router.get('/services', (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const services = db.prepare(`
      SELECT id, name, code, description, created_at
      FROM services
      ORDER BY name ASC
    `).all();

    res.json(services);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve services list' });
  }
});

// GET /api/student/counters
// Returns counters with status and parent service information
router.get('/counters', (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const counters = db.prepare(`
      SELECT 
        c.id, 
        c.name, 
        c.service_id, 
        c.status, 
        s.name as service_name, 
        s.code as service_code,
        (
          SELECT t.token_number 
          FROM tokens t 
          WHERE t.counter_id = c.id AND t.status = 'SERVING'
          LIMIT 1
        ) as current_token_number,
        (
          SELECT COUNT(*) 
          FROM tokens t 
          WHERE t.counter_id = c.id AND t.status = 'WAITING'
        ) * COALESCE(
          (
            SELECT AVG((julianday(completed_at) - julianday(started_at)) * 24 * 60) 
            FROM tokens 
            WHERE counter_id = c.id AND status = 'COMPLETED' AND started_at IS NOT NULL AND completed_at IS NOT NULL
          ), 
          4.5
        ) as estimated_wait_time
      FROM counters c
      JOIN services s ON c.service_id = s.id
      ORDER BY c.name ASC
    `).all();

    res.json(counters);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve counters list' });
  }
});

// POST /api/student/tokens
router.post('/tokens', async (req: AuthRequest, res: Response) => {
  try {
    const { serviceId, counterId } = req.body;
    const user = (req as any).user;
    if (!serviceId) {
      res.status(400).json({ error: 'serviceId is required' });
      return;
    }

    const { queueEngine } = await import('../services/queueEngine.js');
    const { socketService } = await import('../services/socketService.js');

    const result = queueEngine.createToken(serviceId, user.id, user.name, counterId);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    const db = getDb();
    const tokenDetails = db.prepare(`
      SELECT t.*, s.name as service_name, s.code as service_code, c.name as counter_name
      FROM tokens t
      JOIN services s ON t.service_id = s.id
      LEFT JOIN counters c ON t.counter_id = c.id
      WHERE t.id = ?
    `).get(result.token?.id) as any;

    let position = 1;
    let avgServiceTime = 4.5;
    if (tokenDetails.counter_id) {
      const waitingBefore = db.prepare(`
        SELECT COUNT(*) as pos
        FROM tokens
        WHERE counter_id = ? AND status = 'WAITING'
        AND (
          (priority = 'HIGH' AND ? = 'NORMAL')
          OR (priority = ? AND created_at < ?)
        )
      `).get(tokenDetails.counter_id, tokenDetails.priority, tokenDetails.priority, tokenDetails.created_at) as any;
      position = (waitingBefore?.pos || 0) + 1;

      const avgTimeResult = db.prepare(`
        SELECT AVG((julianday(completed_at) - julianday(started_at)) * 24 * 60) as avg_mins
        FROM tokens
        WHERE counter_id = ? AND status = 'COMPLETED' AND started_at IS NOT NULL AND completed_at IS NOT NULL
      `).get(tokenDetails.counter_id) as any;
      if (avgTimeResult?.avg_mins) {
        avgServiceTime = Math.round(avgTimeResult.avg_mins * 10) / 10;
      }
    }
    const peopleAhead = position - 1;
    const estimatedWait = peopleAhead * avgServiceTime;

    socketService.emitTokenCreated(result.token);
    socketService.emitQueueUpdated(serviceId, {
      action: 'CREATED',
      tokenId: result.token?.id
    });

    res.json({
      message: 'Token created successfully',
      token: {
        ...tokenDetails,
        queue_position: position,
        people_ahead: peopleAhead,
        estimated_wait: estimatedWait
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create token' });
  }
});

// POST /api/student/tokens/:tokenId/cancel
router.post('/tokens/:tokenId/cancel', async (req: AuthRequest, res: Response) => {
  try {
    const tokenId = String(req.params.tokenId);
    const { queueEngine } = await import('../services/queueEngine.js');
    const { socketService } = await import('../services/socketService.js');

    const result = queueEngine.cancelToken(tokenId);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    socketService.emitTokenCancelled(result.token);
    socketService.emitQueueUpdated(result.token?.service_id!, {
      action: 'CANCELLED',
      tokenId: result.token?.id
    });

    res.json({ message: 'Token cancelled successfully', token: result.token });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to cancel token' });
  }
});

// GET /api/student/active-token
router.get('/active-token', (req: AuthRequest, res: Response) => {
  try {
    const user = (req as any).user;
    const db = getDb();

    // Find the latest token that is active (WAITING, SERVING, or HELD) for the current student
    const token = db.prepare(`
      SELECT t.*, s.name as service_name, s.code as service_code, c.name as counter_name
      FROM tokens t
      JOIN services s ON t.service_id = s.id
      LEFT JOIN counters c ON t.counter_id = c.id
      WHERE t.student_id = ? AND t.status IN ('WAITING', 'SERVING', 'HELD')
      ORDER BY t.created_at DESC
      LIMIT 1
    `).get(user.id) as any;

    if (!token) {
      res.json(null);
      return;
    }

    // Dynamic queue position calculation
    let position = 1;
    let avgServiceTime = 4.5;
    if (token.counter_id) {
      const waitingBefore = db.prepare(`
        SELECT COUNT(*) as pos
        FROM tokens
        WHERE counter_id = ? AND status = 'WAITING'
        AND (
          (priority = 'HIGH' AND ? = 'NORMAL')
          OR (priority = ? AND created_at < ?)
        )
      `).get(token.counter_id, token.priority, token.priority, token.created_at) as any;
      position = (waitingBefore?.pos || 0) + 1;

      // Average service time calculation (in minutes) for the assigned counter
      const avgTimeResult = db.prepare(`
        SELECT AVG((julianday(completed_at) - julianday(started_at)) * 24 * 60) as avg_mins
        FROM tokens
        WHERE counter_id = ? AND status = 'COMPLETED' AND started_at IS NOT NULL AND completed_at IS NOT NULL
      `).get(token.counter_id) as any;
      if (avgTimeResult?.avg_mins) {
        avgServiceTime = Math.round(avgTimeResult.avg_mins * 10) / 10;
      }
    } else {
      const waitingBefore = db.prepare(`
        SELECT COUNT(*) as pos
        FROM tokens
        WHERE service_id = ? AND status = 'WAITING'
        AND (
          (priority = 'HIGH' AND ? = 'NORMAL')
          OR (priority = ? AND created_at < ?)
        )
      `).get(token.service_id, token.priority, token.priority, token.created_at) as any;
      position = (waitingBefore?.pos || 0) + 1;
    }

    const peopleAhead = position - 1;
    const estimatedWait = peopleAhead * avgServiceTime;

    res.json({
      ...token,
      queue_position: position,
      people_ahead: peopleAhead,
      estimated_wait: estimatedWait
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve active token' });
  }
});

export default router;
