import { Router, Response } from 'express';
import { AuthRequest, authenticateToken, requireRole } from '../middleware/auth.js';
import { getDb } from '../db/database.js';
import { socketService } from '../services/socketService.js';
import crypto from 'crypto';

const router = Router();

// Apply auth middleware to all student routes
router.use(authenticateToken);
router.use(requireRole(['STUDENT']));

/**
 * 1. GET /api/student/services
 * Get all services and their active counters
 */
router.get('/services', (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const services = db.prepare('SELECT id, name, code, description FROM services').all() as any[];
    const counters = db.prepare('SELECT id, service_id, name, status FROM counters').all() as any[];

    // Calculate queue size for each counter
    const queueSizes = db.prepare(`
      SELECT counter_id, COUNT(*) as count 
      FROM tokens 
      WHERE status IN ('WAITING', 'HELD') AND counter_id IS NOT NULL
      GROUP BY counter_id
    `).all() as { counter_id: string; count: number }[];

    const servicesWithCounters = services.map(service => ({
      ...service,
      counters: counters
        .filter(c => c.service_id === service.id)
        .map(c => {
          const queueSize = queueSizes.find(q => q.counter_id === c.id)?.count || 0;
          return {
            ...c,
            queue_size: queueSize,
            estimated_wait_time: queueSize * 5 // Rough estimate: 5 mins per person
          };
        })
    }));

    res.json({ services: servicesWithCounters });
  } catch (err) {
    console.error('Error fetching services:', err);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

/**
 * 2. POST /api/student/tokens/book
 * Book a new token for a specific service and counter
 */
router.post('/tokens/book', (req: AuthRequest, res: Response) => {
  const { service_id, counter_id } = req.body;
  const user = req.user!;

  if (!service_id || !counter_id) {
    res.status(400).json({ error: 'Service ID and Counter ID are required' });
    return;
  }

  try {
    const db = getDb();

    // Execute the complete booking sequence within a single atomic SQLite transaction
    const bookTransaction = db.transaction(() => {
      // 1. Check if the student already has an active token
      const activeToken = db.prepare(`
        SELECT id FROM tokens 
        WHERE student_id = ? AND status IN ('WAITING', 'SERVING', 'HELD')
      `).get(user.id);

      if (activeToken) {
        return { status: 400, error: 'You already have an active token. Complete or cancel it first.' };
      }

      // 2. Verify service exists
      const service = db.prepare('SELECT code FROM services WHERE id = ?').get(service_id) as any;
      if (!service) {
        return { status: 404, error: 'Service not found' };
      }

      // 3. Verify counter exists and is open
      const counter = db.prepare('SELECT id, status, service_id FROM counters WHERE id = ?').get(counter_id) as any;
      if (!counter || counter.service_id !== service_id) {
        return { status: 404, error: 'Counter not found' };
      }
      
      if (counter.status === 'CLOSED' || counter.status === 'MAINTENANCE') {
        return { status: 400, error: 'Counter is currently not accepting new tokens' };
      }

      // 4. Generate unique sequential token number from maximum existing sequence
      const existingTokens = db.prepare(`
        SELECT token_number FROM tokens 
        WHERE service_id = ? AND token_number LIKE ?
      `).all(service_id, `${service.code}-%`) as { token_number: string }[];

      let maxNum = 0;
      for (const t of existingTokens) {
        const parts = t.token_number.split('-');
        if (parts.length >= 2) {
          const num = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      }
      if (maxNum === 0 && existingTokens.length > 0) {
        maxNum = existingTokens.length;
      }

      const seqNum = (maxNum + 1).toString().padStart(3, '0');
      const tokenNumber = `${service.code}-${seqNum}`;
      const tokenId = crypto.randomUUID();
      const createdAt = new Date().toISOString();

      // 5. Insert new token with high-precision timestamp
      db.prepare(`
        INSERT INTO tokens (id, token_number, student_id, student_name, student_email, service_id, counter_id, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'WAITING', ?)
      `).run(tokenId, tokenNumber, user.id, user.name, user.email, service_id, counter_id, createdAt);

      // 6. Fetch the inserted token details with joined service and counter names
      const token = db.prepare(`
        SELECT t.*, s.name as service_name, c.name as counter_name
        FROM tokens t
        JOIN services s ON t.service_id = s.id
        JOIN counters c ON t.counter_id = c.id
        WHERE t.id = ?
      `).get(tokenId);

      return { status: 200, token };
    });

    const result = bookTransaction();

    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    // Notify staff and other students via socket
    socketService.emitQueueUpdated(service_id, { counterId: counter_id });

    res.json({ token: result.token });
  } catch (err: any) {
    console.error('Error booking token:', err);
    if (err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.message?.includes('UNIQUE constraint failed'))) {
      res.status(400).json({ error: 'You already have an active token. Complete or cancel it first.' });
      return;
    }
    res.status(500).json({ error: 'Failed to book token' });
  }
});

/**
 * 3. GET /api/student/tokens/active
 * Get the student's current active token (WAITING, SERVING, HELD)
 */
router.get('/tokens/active', (req: AuthRequest, res: Response) => {
  const user = req.user!;

  try {
    const db = getDb();
    const token = db.prepare(`
      SELECT t.*, s.name as service_name, c.name as counter_name
      FROM tokens t
      JOIN services s ON t.service_id = s.id
      JOIN counters c ON t.counter_id = c.id
      WHERE t.student_id = ? AND t.status IN ('WAITING', 'SERVING', 'HELD')
      ORDER BY t.created_at DESC
      LIMIT 1
    `).get(user.id) as any;

    if (!token) {
      res.json({ token: null });
      return;
    }

    let peopleAhead = 0;
    if (token.status === 'WAITING' || token.status === 'HELD') {
       const aheadQuery = db.prepare(`
         SELECT COUNT(*) as count 
         FROM tokens 
         WHERE counter_id = ? AND status IN ('WAITING', 'HELD') AND created_at < ?
       `).get(token.counter_id, token.created_at) as any;
       peopleAhead = aheadQuery.count;
    }

    res.json({ 
      token: {
        ...token,
        people_ahead: peopleAhead,
        estimated_wait_time: peopleAhead * 5
      } 
    });
  } catch (err) {
    console.error('Error fetching active token:', err);
    res.status(500).json({ error: 'Failed to fetch active token' });
  }
});

/**
 * 4. GET /api/student/tokens/history
 * Get the student's past tokens (COMPLETED, CANCELLED, SKIPPED)
 */
router.get('/tokens/history', (req: AuthRequest, res: Response) => {
  const user = req.user!;

  try {
    const db = getDb();
    const tokens = db.prepare(`
      SELECT t.*, s.name as service_name, c.name as counter_name
      FROM tokens t
      JOIN services s ON t.service_id = s.id
      JOIN counters c ON t.counter_id = c.id
      WHERE t.student_id = ? AND t.status IN ('COMPLETED', 'CANCELLED', 'SKIPPED')
      ORDER BY t.created_at DESC
    `).all(user.id);

    res.json({ tokens });
  } catch (err) {
    console.error('Error fetching token history:', err);
    res.status(500).json({ error: 'Failed to fetch token history' });
  }
});

/**
 * 5. PATCH /api/student/tokens/:tokenId/cancel
 * Allow a student to cancel their waiting token
 */
router.patch('/tokens/:tokenId/cancel', (req: AuthRequest, res: Response) => {
  const { tokenId } = req.params;
  const user = req.user!;

  try {
    const db = getDb();
    
    const token = db.prepare(`
      SELECT id, status, counter_id, service_id FROM tokens WHERE id = ? AND student_id = ?
    `).get(tokenId, user.id) as any;

    if (!token) {
      res.status(404).json({ error: 'Token not found' });
      return;
    }

    if (token.status !== 'WAITING' && token.status !== 'HELD') {
      res.status(400).json({ error: `Cannot cancel token with status: ${token.status}` });
      return;
    }

    db.prepare(`
      UPDATE tokens 
      SET status = 'CANCELLED', completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(tokenId);

    if (token.counter_id && token.service_id) {
       socketService.emitQueueUpdated(token.service_id, { counterId: token.counter_id });
    }

    res.json({ success: true, message: 'Token cancelled successfully' });
  } catch (err) {
    console.error('Error cancelling token:', err);
    res.status(500).json({ error: 'Failed to cancel token' });
  }
});

export default router;
