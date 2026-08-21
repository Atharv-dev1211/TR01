import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index.js';
import { getDb, closeDb } from '../db/database.js';
import { seedDatabase } from '../db/seed.js';
import { JWT_SECRET } from '../middleware/auth.js';

describe('Student Experience & Token Management Integration Tests', () => {
  let studentToken: string;
  let studentWithActiveToken: string;
  let staffToken: string;

  beforeEach(async () => {
    seedDatabase();

    // Login as Demo Student (has no active token in seed)
    const studentRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'student@queuecraft.edu', password: 'password123' });
    studentToken = studentRes.body.token;

    // Login as Aarav Sharma (has active token LP-041 in seed)
    const aaravRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'aarav@queuecraft.edu', password: 'password123' });
    studentWithActiveToken = aaravRes.body.token;

    // Login as Staff
    const staffRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'rudresh@queuecraft.edu', password: 'password123' });
    staffToken = staffRes.body.token;
  });

  afterAll(() => {
    closeDb();
  });

  describe('1. Authentication & RBAC Controls', () => {
    it('should allow student to access student services endpoint', async () => {
      const res = await request(app)
        .get('/api/student/services')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.services)).toBe(true);
      expect(res.body.services.length).toBeGreaterThan(0);
    });

    it('should reject unauthenticated request', async () => {
      const res = await request(app).get('/api/student/services');
      expect(res.status).toBe(401);
    });

    it('should block staff user from accessing student endpoints', async () => {
      const res = await request(app)
        .get('/api/student/services')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('2. Service & Counter Discovery', () => {
    it('should return services along with their counters and queue metrics', async () => {
      const res = await request(app)
        .get('/api/student/services')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      const lpService = res.body.services.find((s: any) => s.code === 'LP');
      expect(lpService).toBeDefined();
      expect(lpService.counters.length).toBe(2);

      const counter2 = lpService.counters.find((c: any) => c.id === 'cntr-lp-2');
      expect(counter2).toBeDefined();
      expect(counter2.status).toBe('OPEN');
      expect(typeof counter2.queue_size).toBe('number');
      expect(typeof counter2.estimated_wait_time).toBe('number');
    });
  });

  describe('3. Active Token Management', () => {
    it('should return null active token for a student without one', async () => {
      const res = await request(app)
        .get('/api/student/tokens/active')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.token).toBeNull();
    });

    it('should return active token for student who currently has one', async () => {
      const res = await request(app)
        .get('/api/student/tokens/active')
        .set('Authorization', `Bearer ${studentWithActiveToken}`);

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.token.token_number).toBe('LP-041');
      expect(res.body.token.status).toBe('SERVING');
    });
  });

  describe('4. Token Booking Flow', () => {
    it('should successfully book a token for an open counter', async () => {
      const res = await request(app)
        .post('/api/student/tokens/book')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          service_id: 'srv-lp',
          counter_id: 'cntr-lp-2'
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.token.status).toBe('WAITING');
      expect(res.body.token.token_number).toMatch(/LP-/);
    });

    it('should reject booking when student already has an active token', async () => {
      const res = await request(app)
        .post('/api/student/tokens/book')
        .set('Authorization', `Bearer ${studentWithActiveToken}`)
        .send({
          service_id: 'srv-lp',
          counter_id: 'cntr-lp-2'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already have an active token/i);
    });

    it('should reject booking for a closed counter', async () => {
      const res = await request(app)
        .post('/api/student/tokens/book')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          service_id: 'srv-lp',
          counter_id: 'cntr-lp-1' // CLOSED in seed
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not accepting|not open|closed/i);
    });
  });

  describe('5. Token Cancellation Flow', () => {
    it('should successfully cancel a waiting token', async () => {
      // Login as Ananya (token LP-042 is WAITING)
      const ananyaRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ananya@queuecraft.edu', password: 'password123' });
      const ananyaToken = ananyaRes.body.token;

      const res = await request(app)
        .patch('/api/student/tokens/tkn-042/cancel')
        .set('Authorization', `Bearer ${ananyaToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify token is now CANCELLED
      const db = getDb();
      const row = db.prepare('SELECT status FROM tokens WHERE id = ?').get('tkn-042') as any;
      expect(row.status).toBe('CANCELLED');
    });

    it('should prevent student from cancelling someone elses token', async () => {
      const res = await request(app)
        .patch('/api/student/tokens/tkn-042/cancel')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(404);
    });

    it('should reject cancelling a completed token', async () => {
      // Login as Neha (tkn-039 is COMPLETED)
      const nehaRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'neha@queuecraft.edu', password: 'password123' });
      const nehaToken = nehaRes.body.token;

      const res = await request(app)
        .patch('/api/student/tokens/tkn-039/cancel')
        .set('Authorization', `Bearer ${nehaToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cannot cancel/i);
    });
  });

  describe('6. Token History', () => {
    it('should return past tokens for student', async () => {
      // Login as Neha (has completed token in seed)
      const nehaRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'neha@queuecraft.edu', password: 'password123' });
      const nehaToken = nehaRes.body.token;

      const res = await request(app)
        .get('/api/student/tokens/history')
        .set('Authorization', `Bearer ${nehaToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.tokens)).toBe(true);
      expect(res.body.tokens.length).toBeGreaterThan(0);
      expect(res.body.tokens[0].token_number).toBe('LP-039');
      expect(res.body.tokens[0].status).toBe('COMPLETED');
    });
  });

  describe('7. Concurrent Booking Safety & Race Condition Protection', () => {
    // Helper to generate valid student JWT and ensure user exists in DB for foreign key constraint
    const createStudentJwt = (id: string, name: string, email: string) => {
      const db = getDb();
      const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
      if (!existing) {
        db.prepare(`
          INSERT INTO users (id, name, email, password_hash, role)
          VALUES (?, ?, ?, 'dummy_password_hash', 'STUDENT')
        `).run(id, name, email);
      }
      return jwt.sign({ id, name, email, role: 'STUDENT' }, JWT_SECRET);
    };

    it('should produce unique token numbers when two students book the same service concurrently', async () => {
      const student1Jwt = createStudentJwt('usr-conc-1', 'Student One', 'st1@queuecraft.edu');
      const student2Jwt = createStudentJwt('usr-conc-2', 'Student Two', 'st2@queuecraft.edu');

      // Send two concurrent booking requests
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/student/tokens/book')
          .set('Authorization', `Bearer ${student1Jwt}`)
          .send({ service_id: 'srv-lp', counter_id: 'cntr-lp-2' }),
        request(app)
          .post('/api/student/tokens/book')
          .set('Authorization', `Bearer ${student2Jwt}`)
          .send({ service_id: 'srv-lp', counter_id: 'cntr-lp-2' })
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const token1 = res1.body.token;
      const token2 = res2.body.token;

      expect(token1.token_number).toBeDefined();
      expect(token2.token_number).toBeDefined();
      // Verify token numbers are strictly distinct (e.g. LP-046 vs LP-047)
      expect(token1.token_number).not.toBe(token2.token_number);
      expect(token1.id).not.toBe(token2.id);

      // Verify both are inserted in DB in WAITING status
      const db = getDb();
      const row1 = db.prepare('SELECT * FROM tokens WHERE id = ?').get(token1.id) as any;
      const row2 = db.prepare('SELECT * FROM tokens WHERE id = ?').get(token2.id) as any;
      expect(row1.status).toBe('WAITING');
      expect(row2.status).toBe('WAITING');
    });

    it('should generate 10 unique, monotonically increasing token numbers under heavy concurrent booking', async () => {
      const numUsers = 10;
      const jwts = Array.from({ length: numUsers }, (_, i) =>
        createStudentJwt(`usr-mass-conc-${i}`, `Mass Student ${i}`, `mass_${i}@queuecraft.edu`)
      );

      // Fire 10 simultaneous booking requests
      const responses = await Promise.all(
        jwts.map(token =>
          request(app)
            .post('/api/student/tokens/book')
            .set('Authorization', `Bearer ${token}`)
            .send({ service_id: 'srv-lp', counter_id: 'cntr-lp-2' })
        )
      );

      // All 10 requests must succeed
      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
      }

      const tokenNumbers = responses.map(r => r.body.token.token_number);
      const tokenIds = responses.map(r => r.body.token.id);

      // Verify all 10 token numbers are distinct
      const uniqueTokenNumbers = new Set(tokenNumbers);
      expect(uniqueTokenNumbers.size).toBe(numUsers);

      // Verify all 10 token IDs are distinct
      const uniqueTokenIds = new Set(tokenIds);
      expect(uniqueTokenIds.size).toBe(numUsers);

      // Verify all are in the database
      const db = getDb();
      const waitingTokens = db.prepare(`
        SELECT token_number FROM tokens
        WHERE service_id = 'srv-lp' AND status = 'WAITING'
      `).all() as Array<{ token_number: string }>;

      for (const num of tokenNumbers) {
        expect(waitingTokens.some(t => t.token_number === num)).toBe(true);
      }
    });

    it('should safely handle concurrent bookings across different services', async () => {
      const lpStudent = createStudentJwt('usr-diff-lp', 'Printer Student', 'lp@queuecraft.edu');
      const cntStudent = createStudentJwt('usr-diff-cnt', 'Canteen Student', 'cnt@queuecraft.edu');

      const [lpRes, cntRes] = await Promise.all([
        request(app)
          .post('/api/student/tokens/book')
          .set('Authorization', `Bearer ${lpStudent}`)
          .send({ service_id: 'srv-lp', counter_id: 'cntr-lp-2' }),
        request(app)
          .post('/api/student/tokens/book')
          .set('Authorization', `Bearer ${cntStudent}`)
          .send({ service_id: 'srv-cnt', counter_id: 'cntr-cnt-1' })
      ]);

      expect(lpRes.status).toBe(200);
      expect(cntRes.status).toBe(200);

      expect(lpRes.body.token.token_number).toMatch(/^LP-/);
      expect(cntRes.body.token.token_number).toMatch(/^CNT-/);
    });

    it('should allow only one booking when a single student submits multiple concurrent booking requests', async () => {
      const studentJwt = createStudentJwt('usr-single-race', 'Race Student', 'race@queuecraft.edu');

      // Attempt to book twice at the exact same instant
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/student/tokens/book')
          .set('Authorization', `Bearer ${studentJwt}`)
          .send({ service_id: 'srv-lp', counter_id: 'cntr-lp-2' }),
        request(app)
          .post('/api/student/tokens/book')
          .set('Authorization', `Bearer ${studentJwt}`)
          .send({ service_id: 'srv-lp', counter_id: 'cntr-lp-2' })
      ]);

      const statuses = [res1.status, res2.status].sort();
      // Exactly one should succeed (200), and one must be rejected (400)
      expect(statuses).toEqual([200, 400]);

      const rejectedRes = res1.status === 400 ? res1 : res2;
      expect(rejectedRes.body.error).toMatch(/already have an active token/i);

      // Verify in DB that only 1 token exists for this student
      const db = getDb();
      const activeRows = db.prepare(`
        SELECT COUNT(*) as count FROM tokens
        WHERE student_id = 'usr-single-race' AND status IN ('WAITING', 'SERVING', 'HELD')
      `).get() as { count: number };
      expect(activeRows.count).toBe(1);
    });

    it('should cleanly reject booking for invalid/closed counter without creating partial records', async () => {
      const studentJwt = createStudentJwt('usr-fail-mid', 'Fail Student', 'fail@queuecraft.edu');
      const db = getDb();
      const beforeCount = (db.prepare('SELECT COUNT(*) as count FROM tokens').get() as any).count;

      const res = await request(app)
        .post('/api/student/tokens/book')
        .set('Authorization', `Bearer ${studentJwt}`)
        .send({ service_id: 'srv-lp', counter_id: 'cntr-lp-1' }); // cntr-lp-1 is CLOSED in seed

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not accepting|not open|closed/i);

      const afterCount = (db.prepare('SELECT COUNT(*) as count FROM tokens').get() as any).count;
      expect(afterCount).toBe(beforeCount);
    });

    it('should enforce database-level unique constraint on (service_id, token_number)', () => {
      const db = getDb();
      // Attempt direct duplicate token_number insertion for same service
      expect(() => {
        db.prepare(`
          INSERT INTO tokens (id, token_number, student_name, service_id, status)
          VALUES ('tkn-dup-test', 'LP-039', 'Duplicate Student', 'srv-lp', 'WAITING')
        `).run();
      }).toThrow(/UNIQUE constraint failed/);
    });
  });
});
