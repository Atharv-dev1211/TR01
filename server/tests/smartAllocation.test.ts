import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getDb, closeDb } from '../db/database.js';
import { seedDatabase } from '../db/seed.js';
import { queueEngine } from '../services/queueEngine.js';

describe('Smart Counter Allocation & Queue Sync Tests', () => {
  beforeEach(() => {
    seedDatabase();
    // Clear tokens for pure isolated engine states in each test,
    // while keeping counters and valid users (foreign keys) populated.
    const db = getDb();
    db.prepare(`DELETE FROM tokens`).run();
  });

  afterAll(() => {
    closeDb();
  });

  it('should calculate effective wait correctly based on queued tokens and average service times', () => {
    const db = getDb();
    const now = new Date();
    const minsAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000).toISOString();

    // Complete 2 tokens with 3 minutes duration for cntr-lp-2
    db.prepare(`
      INSERT INTO tokens (id, token_number, student_name, student_id, service_id, counter_id, status, created_at, started_at, completed_at)
      VALUES 
        ('t1', 'LP-001', 'Test', 'usr-student-aarav', 'srv-lp', 'cntr-lp-2', 'COMPLETED', ?, ?, ?),
        ('t2', 'LP-002', 'Test', 'usr-student-ananya', 'srv-lp', 'cntr-lp-2', 'COMPLETED', ?, ?, ?)
    `).run(
      minsAgo(30), minsAgo(25), minsAgo(22), // 3 mins duration
      minsAgo(20), minsAgo(15), minsAgo(12)  // 3 mins duration
    );

    // Add 3 WAITING tokens to cntr-lp-2
    db.prepare(`
      INSERT INTO tokens (id, token_number, student_name, student_id, service_id, counter_id, status, created_at)
      VALUES 
        ('t3', 'LP-003', 'Student A', 'usr-student-rohan', 'srv-lp', 'cntr-lp-2', 'WAITING', ?),
        ('t4', 'LP-004', 'Student B', 'usr-student-diya', 'srv-lp', 'cntr-lp-2', 'WAITING', ?),
        ('t5', 'LP-005', 'Student C', 'usr-student-vikram', 'srv-lp', 'cntr-lp-2', 'WAITING', ?)
    `).run(minsAgo(5), minsAgo(4), minsAgo(3));

    // Best counter calculation: 3 waiting * 3.0 mins avg = 9 minutes effective wait
    const best = queueEngine.findBestCounter('srv-lp');
    expect(best).not.toBeNull();
    expect(best?.counterId).toBe('cntr-lp-2');

    // Check calculations
    const dbAvg = db.prepare(`
      SELECT AVG((julianday(completed_at) - julianday(started_at)) * 24 * 60) as avg_mins
      FROM tokens
      WHERE counter_id = 'cntr-lp-2' AND status = 'COMPLETED'
    `).get() as any;
    expect(Math.round(dbAvg.avg_mins)).toBe(3);
  });

  it('should select lowest wait counter, handle different service times and tie-breaking correctly', () => {
    const db = getDb();

    // Clean slate for counters table
    db.prepare(`DELETE FROM counters`).run();
    db.prepare(`
      INSERT INTO counters (id, service_id, name, status)
      VALUES 
        ('cntr-1', 'srv-lp', 'Counter 1', 'OPEN'),
        ('cntr-2', 'srv-lp', 'Counter 2', 'OPEN'),
        ('cntr-3', 'srv-lp', 'Counter 3', 'OPEN')
    `).run();

    const now = new Date();
    const minsAgoStr = (m: number) => {
      const d = new Date(now.getTime() - m * 60 * 1000);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    };

    // 1. Counter 1: 5 waiting, average service time = 3.0 mins => Wait = 15 mins
    db.prepare(`
      INSERT INTO tokens (id, token_number, student_name, student_id, service_id, counter_id, status, created_at, started_at, completed_at)
      VALUES ('t-c1-1', 'LP-001', 'Test', 'usr-student-aarav', 'srv-lp', 'cntr-1', 'COMPLETED', ?, ?, ?)
    `).run(minsAgoStr(10), minsAgoStr(8), minsAgoStr(5)); // 3 mins duration

    // Add 5 waiting tokens for Counter 1 using seeded users
    const students = ['usr-student-ananya', 'usr-student-rohan', 'usr-student-diya', 'usr-student-vikram', 'usr-student-neha'];
    for (let i = 0; i < 5; i++) {
      db.prepare(`
        INSERT INTO tokens (id, token_number, student_name, student_id, service_id, counter_id, status, created_at)
        VALUES (?, ?, 'Test', ?, 'srv-lp', 'cntr-1', 'WAITING', ?)
      `).run(`t-c1-w-${i}`, `LP-10${i}`, students[i], minsAgoStr(5));
    }

    // 2. Counter 2: 2 waiting, average service time = 4.0 mins => Wait = 8 mins
    db.prepare(`
      INSERT INTO tokens (id, token_number, student_name, student_id, service_id, counter_id, status, created_at, started_at, completed_at)
      VALUES ('t-c2-1', 'LP-002', 'Test', 'usr-student-karan', 'srv-lp', 'cntr-2', 'COMPLETED', ?, ?, ?)
    `).run(minsAgoStr(15), minsAgoStr(12), minsAgoStr(8)); // 4 mins duration

    // Add 2 waiting tokens for Counter 2
    db.prepare(`
      INSERT INTO tokens (id, token_number, student_name, student_id, service_id, counter_id, status, created_at)
      VALUES 
        ('t-c2-w-0', 'LP-200', 'Test', 'usr-student-demo', 'srv-lp', 'cntr-2', 'WAITING', ?),
        ('t-c2-w-1', 'LP-201', 'Test', 'usr-student-neha', 'srv-lp', 'cntr-2', 'WAITING', ?)
    `).run(minsAgoStr(5), minsAgoStr(5));

    // 3. Counter 3: 4 waiting, average service time = 2.0 mins => Wait = 8 mins
    db.prepare(`
      INSERT INTO tokens (id, token_number, student_name, student_id, service_id, counter_id, status, created_at, started_at, completed_at)
      VALUES ('t-c3-1', 'LP-003', 'Test', 'usr-student-aarav', 'srv-lp', 'cntr-3', 'COMPLETED', ?, ?, ?)
    `).run(minsAgoStr(10), minsAgoStr(7), minsAgoStr(5)); // 2 mins duration

    // Add 4 waiting tokens for Counter 3
    db.prepare(`
      INSERT INTO tokens (id, token_number, student_name, student_id, service_id, counter_id, status, created_at)
      VALUES 
        ('t-c3-w-0', 'LP-300', 'Test', 'usr-student-ananya', 'srv-lp', 'cntr-3', 'WAITING', ?),
        ('t-c3-w-1', 'LP-301', 'Test', 'usr-student-rohan', 'srv-lp', 'cntr-3', 'WAITING', ?),
        ('t-c3-w-2', 'LP-302', 'Test', 'usr-student-diya', 'srv-lp', 'cntr-3', 'WAITING', ?),
        ('t-c3-w-3', 'LP-303', 'Test', 'usr-student-vikram', 'srv-lp', 'cntr-3', 'WAITING', ?)
    `).run(minsAgoStr(5), minsAgoStr(5), minsAgoStr(5), minsAgoStr(5));

    // Counter 2 (8 mins wait, 2 waiting) should win tie-breaker over Counter 3 (8 mins wait, 4 waiting)
    let best = queueEngine.findBestCounter('srv-lp');
    expect(best?.counterId).toBe('cntr-2');

    // Clean tokens and verify stable tie-breaking when wait time and queue lengths are identical
    db.prepare(`DELETE FROM tokens`).run();
    db.prepare(`UPDATE counters SET status = 'CLOSED' WHERE id = 'cntr-1'`).run(); // close Counter 1 to keep it out of selection

    // Add identical completed status: 3 mins avg service time for Counter 2 and Counter 3
    db.prepare(`
      INSERT INTO tokens (id, token_number, student_name, student_id, service_id, counter_id, status, created_at, started_at, completed_at)
      VALUES 
        ('t-c2-comp', 'LP-200', 'Test', 'usr-student-aarav', 'srv-lp', 'cntr-2', 'COMPLETED', ?, ?, ?),
        ('t-c3-comp', 'LP-300', 'Test', 'usr-student-ananya', 'srv-lp', 'cntr-3', 'COMPLETED', ?, ?, ?)
    `).run(
      minsAgoStr(10), minsAgoStr(8), minsAgoStr(5), // 3 mins
      minsAgoStr(10), minsAgoStr(8), minsAgoStr(5)  // 3 mins
    );

    // Add identical waiting queue: 2 waiting tokens for both
    db.prepare(`
      INSERT INTO tokens (id, token_number, student_name, student_id, service_id, counter_id, status, created_at)
      VALUES 
        ('t-c2-w1', 'LP-201', 'Test', 'usr-student-rohan', 'srv-lp', 'cntr-2', 'WAITING', ?),
        ('t-c2-w2', 'LP-202', 'Test', 'usr-student-diya', 'srv-lp', 'cntr-2', 'WAITING', ?),
        ('t-c3-w1', 'LP-301', 'Test', 'usr-student-vikram', 'srv-lp', 'cntr-3', 'WAITING', ?),
        ('t-c3-w2', 'LP-302', 'Test', 'usr-student-neha', 'srv-lp', 'cntr-3', 'WAITING', ?)
    `).run(minsAgoStr(2), minsAgoStr(2), minsAgoStr(2), minsAgoStr(2));

    // Both Counter 2 and Counter 3 have 2 waiting and 6 minutes wait time.
    // Stable lexicographical counter ID tie-breaker: cntr-2 vs cntr-3.
    // cntr-2 should win.
    best = queueEngine.findBestCounter('srv-lp');
    expect(best?.counterId).toBe('cntr-2');
  });

  it('should ignore closed or maintenance counters', () => {
    const db = getDb();
    db.prepare(`DELETE FROM counters`).run();
    db.prepare(`
      INSERT INTO counters (id, service_id, name, status)
      VALUES 
        ('cntr-1', 'srv-lp', 'Counter 1', 'CLOSED'),
        ('cntr-2', 'srv-lp', 'Counter 2', 'MAINTENANCE'),
        ('cntr-3', 'srv-lp', 'Counter 3', 'OPEN')
    `).run();

    const best = queueEngine.findBestCounter('srv-lp');
    expect(best?.counterId).toBe('cntr-3');
  });

  it('should return error if no active counters are available', () => {
    const db = getDb();
    db.prepare(`DELETE FROM counters`).run();
    db.prepare(`
      INSERT INTO counters (id, service_id, name, status)
      VALUES 
        ('cntr-1', 'srv-lp', 'Counter 1', 'CLOSED'),
        ('cntr-2', 'srv-lp', 'Counter 2', 'MAINTENANCE')
    `).run();

    const result = queueEngine.createToken('srv-lp', 'usr-student-demo', 'Demo Student');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No active counters are currently available/i);
  });

  it('should recalculate wait times and queue lengths when a token is cancelled', () => {
    const db = getDb();
    db.prepare(`DELETE FROM counters`).run();
    db.prepare(`
      INSERT INTO counters (id, service_id, name, status)
      VALUES ('cntr-1', 'srv-lp', 'Counter 1', 'OPEN')
    `).run();

    const result1 = queueEngine.createToken('srv-lp', 'usr-student-demo', 'Demo Student');
    expect(result1.success).toBe(true);

    let countInDb = (db.prepare(`SELECT COUNT(*) as cnt FROM tokens WHERE counter_id = 'cntr-1' AND status = 'WAITING'`).get() as any).cnt;
    expect(countInDb).toBe(1);

    const cancelRes = queueEngine.cancelToken(result1.token?.id!);
    expect(cancelRes.success).toBe(true);

    countInDb = (db.prepare(`SELECT COUNT(*) as cnt FROM tokens WHERE counter_id = 'cntr-1' AND status = 'WAITING'`).get() as any).cnt;
    expect(countInDb).toBe(0);
  });

  it('should recalculate wait times and queue lengths when a token is completed', () => {
    const db = getDb();
    db.prepare(`DELETE FROM counters`).run();
    db.prepare(`
      INSERT INTO counters (id, service_id, name, status)
      VALUES ('cntr-1', 'srv-lp', 'Counter 1', 'OPEN')
    `).run();

    const result = queueEngine.createToken('srv-lp', 'usr-student-demo', 'Demo Student');
    expect(result.success).toBe(true);

    const callRes = queueEngine.callNextToken('srv-lp', 'cntr-1');
    expect(callRes.success).toBe(true);

    const completeRes = queueEngine.completeToken(result.token?.id!, 'cntr-1');
    expect(completeRes.success).toBe(true);

    const countInDb = (db.prepare(`SELECT COUNT(*) as cnt FROM tokens WHERE counter_id = 'cntr-1' AND status = 'WAITING'`).get() as any).cnt;
    expect(countInDb).toBe(0);
  });

  it('should dynamically select the best counter on creation', () => {
    const db = getDb();
    db.prepare(`DELETE FROM counters`).run();
    db.prepare(`
      INSERT INTO counters (id, service_id, name, status)
      VALUES 
        ('cntr-1', 'srv-lp', 'Counter 1', 'OPEN'),
        ('cntr-2', 'srv-lp', 'Counter 2', 'OPEN')
    `).run();

    const t1 = queueEngine.createToken('srv-lp', 'usr-student-aarav', 'Aarav');
    expect(t1.token?.counter_id).toBe('cntr-1');

    const t2 = queueEngine.createToken('srv-lp', 'usr-student-ananya', 'Ananya');
    expect(t2.token?.counter_id).toBe('cntr-2');
  });

  it('should adjust allocation dynamically when counter status changes', () => {
    const db = getDb();
    db.prepare(`DELETE FROM counters`).run();
    db.prepare(`
      INSERT INTO counters (id, service_id, name, status)
      VALUES 
        ('cntr-1', 'srv-lp', 'Counter 1', 'OPEN'),
        ('cntr-2', 'srv-lp', 'Counter 2', 'CLOSED')
    `).run();

    const t1 = queueEngine.createToken('srv-lp', 'usr-student-aarav', 'Aarav');
    expect(t1.token?.counter_id).toBe('cntr-1');

    db.prepare(`UPDATE counters SET status = 'OPEN' WHERE id = 'cntr-2'`).run();

    const t2 = queueEngine.createToken('srv-lp', 'usr-student-ananya', 'Ananya');
    expect(t2.token?.counter_id).toBe('cntr-2');
  });
});
