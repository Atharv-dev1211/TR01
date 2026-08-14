import { getDb } from '../db/database.js';

export type TokenStatus = 'WAITING' | 'SERVING' | 'HELD' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED';

export interface TokenRecord {
  id: string;
  token_number: string;
  student_id: string | null;
  student_name: string;
  student_email: string | null;
  service_id: string;
  counter_id: string | null;
  priority: 'NORMAL' | 'HIGH';
  status: TokenStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  held_at: string | null;
  notes: string | null;
}

export interface QueueEngineResult {
  success: boolean;
  token?: TokenRecord;
  error?: string;
}

/**
 * Interface definition for Smart Queue Engine module.
 * Designed to be modular so Atharva's Smart Queue Engine can extend or replace
 * queue algorithms without affecting Staff Module REST APIs or React UI.
 */
export interface IQueueEngine {
  getNextEligibleToken(serviceId: string, counterId: string): TokenRecord | null;
  callNextToken(serviceId: string, counterId: string): QueueEngineResult;
  completeToken(tokenId: string, counterId: string): QueueEngineResult;
  holdToken(tokenId: string, counterId: string): QueueEngineResult;
  resumeToken(tokenId: string, counterId: string): QueueEngineResult;
  skipToken(tokenId: string, counterId: string): QueueEngineResult;
  getWaitingQueue(serviceId: string): TokenRecord[];
  getCurrentServingToken(counterId: string): TokenRecord | null;
}

export class DefaultQueueEngine implements IQueueEngine {
  /**
   * Retrieves the next eligible token from the queue.
   * Smart Rule: Priority HIGH comes before NORMAL. FCFS (earliest created_at) within priority.
   */
  getNextEligibleToken(serviceId: string): TokenRecord | null {
    const db = getDb();
    const token = db.prepare(`
      SELECT * FROM tokens
      WHERE service_id = ? AND status = 'WAITING'
      ORDER BY
        CASE priority WHEN 'HIGH' THEN 1 ELSE 2 END ASC,
        created_at ASC
      LIMIT 1
    `).get(serviceId) as TokenRecord | undefined;

    return token || null;
  }

  /**
   * CALL NEXT TOKEN Operation
   * Enforces: Counter is OPEN, no active SERVING token exists, selects next token in transaction.
   */
  callNextToken(serviceId: string, counterId: string): QueueEngineResult {
    const db = getDb();

    // Verify counter status
    const counter = db.prepare('SELECT status FROM counters WHERE id = ?').get(counterId) as any;
    if (!counter) {
      return { success: false, error: 'Counter not found' };
    }
    if (counter.status !== 'OPEN') {
      return { success: false, error: `Cannot call next token: Counter is currently ${counter.status}` };
    }

    let resultToken: TokenRecord | null = null;
    let errorMessage: string | null = null;

    // Transaction safety against race conditions
    const transaction = db.transaction(() => {
      // Check if there is already an active SERVING token at this counter
      const activeServing = db.prepare(`
        SELECT * FROM tokens WHERE counter_id = ? AND status = 'SERVING'
      `).get(counterId) as TokenRecord | undefined;

      if (activeServing) {
        errorMessage = `Counter already has active serving token ${activeServing.token_number}. Complete, hold, or skip it first.`;
        return;
      }

      // Fetch next eligible token
      const nextToken = this.getNextEligibleToken(serviceId);
      if (!nextToken) {
        errorMessage = 'Waiting queue is currently empty for this service.';
        return;
      }

      const now = new Date().toISOString();

      // State Transition: WAITING -> SERVING
      db.prepare(`
        UPDATE tokens
        SET status = 'SERVING', counter_id = ?, started_at = ?
        WHERE id = ? AND status = 'WAITING'
      `).run(counterId, now, nextToken.id);

      resultToken = db.prepare('SELECT * FROM tokens WHERE id = ?').get(nextToken.id) as TokenRecord;
    });

    transaction();

    if (errorMessage) {
      return { success: false, error: errorMessage };
    }

    if (!resultToken) {
      return { success: false, error: 'Failed to update token state to SERVING' };
    }

    return { success: true, token: resultToken };
  }

  /**
   * COMPLETE TOKEN Operation
   * State Transition: SERVING -> COMPLETED
   */
  completeToken(tokenId: string, counterId: string): QueueEngineResult {
    const db = getDb();
    let resultToken: TokenRecord | null = null;
    let errorMessage: string | null = null;

    const transaction = db.transaction(() => {
      const token = db.prepare('SELECT * FROM tokens WHERE id = ?').get(tokenId) as TokenRecord | undefined;
      if (!token) {
        errorMessage = 'Token not found';
        return;
      }

      if (token.status !== 'SERVING') {
        errorMessage = `Invalid state transition: Cannot complete token with status '${token.status}'. Must be 'SERVING'.`;
        return;
      }

      if (token.counter_id !== counterId) {
        errorMessage = 'Unauthorized: Token is assigned to a different counter';
        return;
      }

      const now = new Date().toISOString();

      db.prepare(`
        UPDATE tokens
        SET status = 'COMPLETED', completed_at = ?
        WHERE id = ? AND status = 'SERVING'
      `).run(now, tokenId);

      resultToken = db.prepare('SELECT * FROM tokens WHERE id = ?').get(tokenId) as TokenRecord;
    });

    transaction();

    if (errorMessage) return { success: false, error: errorMessage };
    return { success: true, token: resultToken! };
  }

  /**
   * HOLD TOKEN Operation
   * State Transition: SERVING -> HELD
   */
  holdToken(tokenId: string, counterId: string): QueueEngineResult {
    const db = getDb();
    let resultToken: TokenRecord | null = null;
    let errorMessage: string | null = null;

    const transaction = db.transaction(() => {
      const token = db.prepare('SELECT * FROM tokens WHERE id = ?').get(tokenId) as TokenRecord | undefined;
      if (!token) {
        errorMessage = 'Token not found';
        return;
      }

      if (token.status !== 'SERVING') {
        errorMessage = `Invalid state transition: Cannot hold token with status '${token.status}'. Must be 'SERVING'.`;
        return;
      }

      if (token.counter_id !== counterId) {
        errorMessage = 'Unauthorized: Token is assigned to a different counter';
        return;
      }

      const now = new Date().toISOString();

      db.prepare(`
        UPDATE tokens
        SET status = 'HELD', held_at = ?
        WHERE id = ? AND status = 'SERVING'
      `).run(now, tokenId);

      resultToken = db.prepare('SELECT * FROM tokens WHERE id = ?').get(tokenId) as TokenRecord;
    });

    transaction();

    if (errorMessage) return { success: false, error: errorMessage };
    return { success: true, token: resultToken! };
  }

  /**
   * RESUME TOKEN Operation
   * State Transition: HELD -> SERVING
   */
  resumeToken(tokenId: string, counterId: string): QueueEngineResult {
    const db = getDb();
    let resultToken: TokenRecord | null = null;
    let errorMessage: string | null = null;

    const transaction = db.transaction(() => {
      const token = db.prepare('SELECT * FROM tokens WHERE id = ?').get(tokenId) as TokenRecord | undefined;
      if (!token) {
        errorMessage = 'Token not found';
        return;
      }

      if (token.status !== 'HELD') {
        errorMessage = `Invalid state transition: Cannot resume token with status '${token.status}'. Must be 'HELD'.`;
        return;
      }

      // Ensure counter doesn't already have an active SERVING token
      const activeServing = db.prepare(`
        SELECT * FROM tokens WHERE counter_id = ? AND status = 'SERVING'
      `).get(counterId) as TokenRecord | undefined;

      if (activeServing) {
        errorMessage = `Cannot resume token: Counter already has active serving token ${activeServing.token_number}.`;
        return;
      }

      const now = new Date().toISOString();

      db.prepare(`
        UPDATE tokens
        SET status = 'SERVING', counter_id = ?, started_at = ?
        WHERE id = ? AND status = 'HELD'
      `).run(counterId, now, tokenId);

      resultToken = db.prepare('SELECT * FROM tokens WHERE id = ?').get(tokenId) as TokenRecord;
    });

    transaction();

    if (errorMessage) return { success: false, error: errorMessage };
    return { success: true, token: resultToken! };
  }

  /**
   * SKIP TOKEN Operation
   * State Transition: SERVING or HELD -> SKIPPED (Preserves record for audit/history!)
   */
  skipToken(tokenId: string, counterId: string): QueueEngineResult {
    const db = getDb();
    let resultToken: TokenRecord | null = null;
    let errorMessage: string | null = null;

    const transaction = db.transaction(() => {
      const token = db.prepare('SELECT * FROM tokens WHERE id = ?').get(tokenId) as TokenRecord | undefined;
      if (!token) {
        errorMessage = 'Token not found';
        return;
      }

      if (token.status !== 'SERVING' && token.status !== 'HELD' && token.status !== 'WAITING') {
        errorMessage = `Invalid state transition: Cannot skip token with status '${token.status}'.`;
        return;
      }

      const now = new Date().toISOString();

      db.prepare(`
        UPDATE tokens
        SET status = 'SKIPPED', skipped_at = ?
        WHERE id = ?
      `).run(now, tokenId);

      resultToken = db.prepare('SELECT * FROM tokens WHERE id = ?').get(tokenId) as TokenRecord;
    });

    transaction();

    if (errorMessage) return { success: false, error: errorMessage };
    return { success: true, token: resultToken! };
  }

  /**
   * Get all waiting tokens ordered by priority and timestamp
   */
  getWaitingQueue(serviceId: string): TokenRecord[] {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM tokens
      WHERE service_id = ? AND status = 'WAITING'
      ORDER BY
        CASE priority WHEN 'HIGH' THEN 1 ELSE 2 END ASC,
        created_at ASC
    `).all(serviceId) as TokenRecord[];
  }

  /**
   * Get current serving token for counter
   */
  getCurrentServingToken(counterId: string): TokenRecord | null {
    const db = getDb();
    const token = db.prepare(`
      SELECT * FROM tokens
      WHERE counter_id = ? AND status = 'SERVING'
      LIMIT 1
    `).get(counterId) as TokenRecord | undefined;

    return token || null;
  }
}

// Export singleton queue engine instance
export const queueEngine: IQueueEngine = new DefaultQueueEngine();
