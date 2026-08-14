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
      SELECT c.id, c.name, c.service_id, c.status, s.name as service_name, s.code as service_code
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
    const { serviceId } = req.body;
    const user = (req as any).user;
    if (!serviceId) {
      res.status(400).json({ error: 'serviceId is required' });
      return;
    }

    const { queueEngine } = await import('../services/queueEngine.js');
    const { socketService } = await import('../services/socketService.js');

    const result = queueEngine.createToken(serviceId, user.id, user.name);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    socketService.emitTokenCreated(result.token);
    socketService.emitQueueUpdated(serviceId, {
      action: 'CREATED',
      tokenId: result.token?.id
    });

    res.json({ message: 'Token created successfully', token: result.token });
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

export default router;
