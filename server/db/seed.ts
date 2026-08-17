import crypto from 'crypto';
import { getDb } from './database.js';
import { initializeSchema } from './schema.js';

export function hashPassword(password: string): string {
  const salt = 'queuecraft_salt_2026';
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

export function seedDatabase(): void {
  initializeSchema();
  const db = getDb();

  // Clear existing data for fresh seed reset
  db.exec(`
    DELETE FROM tokens;
    DELETE FROM counters;
    DELETE FROM services;
    DELETE FROM users;
  `);

  const passwordHash = hashPassword('password123');

  // Insert Users
  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertUser.run('usr-staff-rudresh', 'Rudresh', 'rudresh@queuecraft.edu', passwordHash, 'STAFF');
  insertUser.run('usr-staff-priya', 'Priya Singh', 'priya@queuecraft.edu', passwordHash, 'STAFF');
  insertUser.run('usr-student-aarav', 'Aarav Sharma', 'aarav@queuecraft.edu', passwordHash, 'STUDENT');
  insertUser.run('usr-student-ananya', 'Ananya Patel', 'ananya@queuecraft.edu', passwordHash, 'STUDENT');
  insertUser.run('usr-student-rohan', 'Rohan Verma', 'rohan@queuecraft.edu', passwordHash, 'STUDENT');
  insertUser.run('usr-student-diya', 'Diya Sengupta', 'diya@queuecraft.edu', passwordHash, 'STUDENT');
  insertUser.run('usr-student-vikram', 'Vikram Malhotra', 'vikram@queuecraft.edu', passwordHash, 'STUDENT');
  insertUser.run('usr-student-neha', 'Neha Joshi', 'neha@queuecraft.edu', passwordHash, 'STUDENT');
  insertUser.run('usr-student-karan', 'Karan Mehta', 'karan@queuecraft.edu', passwordHash, 'STUDENT');
  insertUser.run('usr-student-demo', 'Demo Student', 'student@queuecraft.edu', passwordHash, 'STUDENT');
  insertUser.run('usr-admin-demo', 'System Admin', 'admin@queuecraft.edu', passwordHash, 'ADMIN');

  // Insert Services
  const insertService = db.prepare(`
    INSERT INTO services (id, name, code, description)
    VALUES (?, ?, ?, ?)
  `);

  insertService.run('srv-lp', 'Library Printer', 'LP', 'High-speed printing, binding, and scanning services in the Central Library.');
  insertService.run('srv-cnt', 'Campus Canteen', 'CNT', 'Order pickup and food token counters at the Student Hub.');
  insertService.run('srv-adm', 'Administration Office', 'ADM', 'Student document verification, transcripts, and fee payment desks.');

  // Insert Counters
  const insertCounter = db.prepare(`
    INSERT INTO counters (id, service_id, name, status, assigned_staff_id)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertCounter.run('cntr-lp-1', 'srv-lp', 'Printer Counter 1', 'CLOSED', null);
  insertCounter.run('cntr-lp-2', 'srv-lp', 'Printer Counter 2', 'OPEN', 'usr-staff-rudresh');
  insertCounter.run('cntr-cnt-1', 'srv-cnt', 'Canteen Counter 1', 'OPEN', 'usr-staff-priya');

  // Insert Realistic Initial Tokens for Library Printer Counter 2
  const insertToken = db.prepare(`
    INSERT INTO tokens (
      id, token_number, student_id, student_name, student_email, service_id, counter_id,
      priority, status, created_at, started_at, completed_at, skipped_at, held_at, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date();
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000).toISOString();

  // LP-039 (Completed earlier)
  insertToken.run(
    'tkn-039', 'LP-039', 'usr-student-neha', 'Neha Joshi', 'neha@queuecraft.edu',
    'srv-lp', 'cntr-lp-2', 'NORMAL', 'COMPLETED',
    minsAgo(45), minsAgo(40), minsAgo(32), null, null, 'Printed 15 pages thesis draft'
  );

  // LP-040 (Completed earlier)
  insertToken.run(
    'tkn-040', 'LP-040', 'usr-student-karan', 'Karan Mehta', 'karan@queuecraft.edu',
    'srv-lp', 'cntr-lp-2', 'NORMAL', 'COMPLETED',
    minsAgo(35), minsAgo(31), minsAgo(22), null, null, 'Color poster printing'
  );

  // LP-041 (Currently SERVING)
  insertToken.run(
    'tkn-041', 'LP-041', 'usr-student-aarav', 'Aarav Sharma', 'aarav@queuecraft.edu',
    'srv-lp', 'cntr-lp-2', 'NORMAL', 'SERVING',
    minsAgo(25), minsAgo(10), null, null, null, 'Lab manual spiral binding'
  );

  // LP-042 (WAITING - Normal)
  insertToken.run(
    'tkn-042', 'LP-042', 'usr-student-ananya', 'Ananya Patel', 'ananya@queuecraft.edu',
    'srv-lp', 'cntr-lp-2', 'NORMAL', 'WAITING',
    minsAgo(10), null, null, null, null, 'Assignment printout'
  );

  // LP-043 (WAITING - Normal)
  insertToken.run(
    'tkn-043', 'LP-043', 'usr-student-rohan', 'Rohan Verma', 'rohan@queuecraft.edu',
    'srv-lp', 'cntr-lp-2', 'NORMAL', 'WAITING',
    minsAgo(5), null, null, null, null, 'Project report 5 copies'
  );

  // LP-044 (WAITING - HIGH Priority)
  insertToken.run(
    'tkn-044', 'LP-044', 'usr-student-diya', 'Diya Sengupta', 'diya@queuecraft.edu',
    'srv-lp', 'cntr-lp-2', 'HIGH', 'WAITING',
    minsAgo(2), null, null, null, null, 'Urgent exam hall ticket printout'
  );

  // LP-045 (HELD)
  insertToken.run(
    'tkn-045', 'LP-045', 'usr-student-vikram', 'Vikram Malhotra', 'vikram@queuecraft.edu',
    'srv-lp', 'cntr-lp-2', 'NORMAL', 'HELD',
    minsAgo(30), minsAgo(22), null, null, minsAgo(18), 'Awaiting digital payment confirmation'
  );

  console.log('Successfully seeded QueueCraft database with staff demo data!');
}

// Execute seed if called directly
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seedDatabase();
}
