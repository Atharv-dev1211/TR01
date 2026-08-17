import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { getDb, closeDb } from '../db/database.js';
import { seedDatabase } from '../db/seed.js';

describe('Admin Module REST API & Authentication Integration Tests', () => {
    let adminToken: string;
    let staffToken: string;
    let studentToken: string;

    beforeEach(async () => {
        // Reset database to seed data
        seedDatabase();

        // Authenticate and fetch tokens
        const adminLogin = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@queuecraft.edu', password: 'password123' });
        adminToken = adminLogin.body.token;

        const staffLogin = await request(app)
            .post('/api/auth/login')
            .send({ email: 'rudresh@queuecraft.edu', password: 'password123' });
        staffToken = staffLogin.body.token;

        const studentLogin = await request(app)
            .post('/api/auth/login')
            .send({ email: 'student@queuecraft.edu', password: 'password123' });
        studentToken = studentLogin.body.token;
    });

    afterAll(() => {
        closeDb();
    });

    describe('1. Authentication and RBAC Guards', () => {
        it('should block non-authenticated requests to admin routes', async () => {
            const res = await request(app).get('/api/admin/dashboard');
            expect(res.status).toBe(401);
        });

        it('should block staff accounts from accessing admin dashboard routes', async () => {
            const res = await request(app)
                .get('/api/admin/dashboard')
                .set('Authorization', `Bearer ${staffToken}`);
            expect(res.status).toBe(403);
        });

        it('should allow admin accounts to access admin dashboard routes', async () => {
            const res = await request(app)
                .get('/api/admin/dashboard')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(200);
            expect(res.body.services_count).toBeDefined();
            expect(res.body.active_counters_count).toBeDefined();
        });
    });

    describe('2. Services List Configuration CRUD', () => {
        it('should list all services sorted alphabetically', async () => {
            const res = await request(app)
                .get('/api/admin/services')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThan(0);
            expect(res.body[0].code).toBeDefined();
        });

        it('should fail to create service with duplicate shortcode', async () => {
            // srv-lp has code LP is seeded
            const res = await request(app)
                .post('/api/admin/services')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Duplicate Printer', code: 'LP', description: 'Testing duplicate' });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/already taken/i);
        });

        it('should support successful Create, Update and Delete of service', async () => {
            // 1. Create
            const createRes = await request(app)
                .post('/api/admin/services')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Science Laboratory Desk', code: 'SLD', description: 'Lab bookings' });

            expect(createRes.status).toBe(210);
            expect(createRes.body.id).toBeDefined();
            expect(createRes.body.code).toBe('SLD');
            const serviceId = createRes.body.id;

            // 2. Update
            const updateRes = await request(app)
                .patch(`/api/admin/services/${serviceId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Science Laboratory Station' });

            expect(updateRes.status).toBe(200);
            expect(updateRes.body.name).toBe('Science Laboratory Station');

            // 3. Delete
            const deleteRes = await request(app)
                .delete(`/api/admin/services/${serviceId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(deleteRes.status).toBe(200);
            expect(deleteRes.body.success).toBe(true);
        });

        it('should refuse to delete service with assigned active counters', async () => {
            // srv-lp has active counters in seed
            const res = await request(app)
                .delete('/api/admin/services/srv-lp')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/cannot delete/i);
        });
    });

    describe('3. Counters and Staff Assignment', () => {
        it('should list all counters with service details and staff operators', async () => {
            const res = await request(app)
                .get('/api/admin/counters')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(200);
            expect(res.body.length).toBeGreaterThan(0);
            expect(res.body[0].service_name).toBeDefined();
        });

        it('should perform counter CRUD transitions', async () => {
            // Create counter
            const createRes = await request(app)
                .post('/api/admin/counters')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Tester counter 3', service_id: 'srv-lp', status: 'CLOSED' });

            expect(createRes.status).toBe(210);
            const cntId = createRes.body.id;

            // Update counter status
            const updateRes = await request(app)
                .patch(`/api/admin/counters/${cntId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'BUSY' });
            expect(updateRes.status).toBe(200);
            expect(updateRes.body.status).toBe('BUSY');

            // Delete counter
            const deleteRes = await request(app)
                .delete(`/api/admin/counters/${cntId}`)
                .set('Authorization', `Bearer ${adminToken}`);
            expect(deleteRes.status).toBe(200);
            expect(deleteRes.body.success).toBe(true);
        });

        it('should handle operator counter assignment and enforce exclusivity', async () => {
            // Rudresh is currently assigned to cntr-lp-2 in seed
            // Let's assign Rudresh to cntr-lp-1
            const res = await request(app)
                .patch('/api/admin/counters/cntr-lp-1/assign-staff')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ staffId: 'usr-staff-rudresh' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.assigned_staff_id).toBe('usr-staff-rudresh');

            // Verify Rudresh is no longer assigned to cntr-lp-2 (exclusivity)
            const listRes = await request(app)
                .get('/api/admin/counters')
                .set('Authorization', `Bearer ${adminToken}`);

            const prevCounter = listRes.body.find((c: any) => c.id === 'cntr-lp-2');
            expect(prevCounter.assigned_staff_id).toBeNull();
        });
    });

    describe('4. Historical Analytics and Live Monitor', () => {
        it('should fetch analytics dashboard aggregations', async () => {
            const res = await request(app)
                .get('/api/admin/analytics')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.summary).toBeDefined();
            expect(res.body.summary.completed_count).toBeDefined();
            expect(res.body.service_distribution).toBeDefined();
            expect(res.body.counter_activity).toBeDefined();
        });

        it('should gather all counter active state in live monitor', async () => {
            const res = await request(app)
                .get('/api/admin/live-monitor')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThan(0);
            expect(res.body[0].waiting_count).toBeDefined();
        });
    });
});
