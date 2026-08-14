import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDb } from '../db/database.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'queuecraft_jwt_secret_key_2026';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    name: string;
    email: string;
    role: 'STUDENT' | 'STAFF' | 'ADMIN';
  };
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Access token is missing' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Forbidden: Invalid or expired access token' });
  }
}

export function requireRole(allowedRoles: Array<'STUDENT' | 'STAFF' | 'ADMIN'>) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Forbidden: Access restricted to ${allowedRoles.join(', ')} users`
      });
      return;
    }

    next();
  };
}

export function requireCounterAssignment(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'STAFF') {
    res.status(403).json({ error: 'Forbidden: Staff role required' });
    return;
  }

  const db = getDb();
  const counter = db.prepare(`
    SELECT c.*, s.name as service_name, s.code as service_code
    FROM counters c
    JOIN services s ON c.service_id = s.id
    WHERE c.assigned_staff_id = ?
  `).get(req.user.id) as any;

  if (!counter) {
    res.status(403).json({
      error: 'Forbidden: Staff member is not assigned to any active counter'
    });
    return;
  }

  // Attach counter details to request object for easy access
  (req as any).assignedCounter = counter;
  next();
}
