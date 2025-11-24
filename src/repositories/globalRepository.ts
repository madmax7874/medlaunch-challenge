import type { User, Role } from '../models/user';
import { Report } from '../models/report';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

// generate stable seeded ids for users so reports can reference them
const seededUserIds = {
    admin1: randomUUID(),
    user1: randomUUID(),
    user2: randomUUID(),
};

class InMemoryUserRepository {
    private store: User[] = [];

    constructor() {
        // seed static users (passwords hashed). use generated ids so reports can reference them
        const seedPlain: Array<{ id: string; name: string; email: string; password: string; role: Role }> = [
            { id: seededUserIds.admin1, name: 'Admin 1', email: 'admin1@med.com', password: 'Adm!n1', role: 'ADMIN' },
            { id: seededUserIds.user1, name: 'User 1', email: 'user1@med.com', password: 'User!No1', role: 'USER' },
            { id: seededUserIds.user2, name: 'User 2', email: 'user2@med.com', password: 'User!No2', role: 'USER' },
        ];

        for (const s of seedPlain) {
            this.store.push({
                id: s.id,
                name: s.name,
                email: s.email,
                role: s.role,
                password: bcrypt.hashSync(s.password, 10),
            } as User);
        }
    }

    findByEmail(email: string): User | undefined {
        return this.store.find((u) => u.email === email);
    }

    add(user: User): void {
        this.store.push(user);
    }

    list(): User[] {
        return this.store.slice();
    }
}

export class InMemoryReportRepository {
    private store: Map<string, Report> = new Map();

    constructor() {
        // Seed some static reports for demo/testing
        const now = new Date().toISOString();
        const seeds: Report[] = [
            {
                id: randomUUID(),
                title: 'Team Offsite Q1',
                ownerId: seededUserIds.user1,
                department: 'Engineering',
                createdAt: now,
                updatedAt: now,
                version: 1,
                budgetCap: 2000,
                budgetOverride: false,
                entries: [
                    { id: randomUUID(), description: 'Flights', amount: 600, incurredAt: now },
                    { id: randomUUID(), description: 'Hotel', amount: 800, incurredAt: now },
                    { id: randomUUID(), description: 'Catering', amount: 300, incurredAt: now },
                ],
                viewers: [{ userId: seededUserIds.user2, access: 'VIEW' }],
                comments: [
                    { id: randomUUID(), authorId: seededUserIds.user1, text: 'Initial plan looks good', createdAt: now, priority: 'normal' },
                ],
                metadata: { location: 'Remote', quarter: 'Q1' },
                status: 'DRAFT',
            },
            {
                id: randomUUID(),
                title: 'Customer Conference',
                ownerId: seededUserIds.admin1,
                department: 'Sales',
                createdAt: now,
                updatedAt: now,
                version: 1,
                budgetCap: 1000,
                budgetOverride: false,
                entries: [
                    { id: randomUUID(), description: 'Booth', amount: 700, incurredAt: now },
                    { id: randomUUID(), description: 'Travel', amount: 600, incurredAt: now },
                ],
                viewers: [{ userId: seededUserIds.user2, access: 'VIEW' }],
                comments: [
                    { id: randomUUID(), authorId: seededUserIds.admin1, text: 'Submitted for approval', createdAt: now, priority: 'high' },
                ],
                metadata: { conference: 'ACME Summit', attendees: 120 },
                status: 'SUBMITTED',
            },
            {
                id: randomUUID(),
                title: 'New Laptops',
                ownerId: seededUserIds.user2,
                department: 'IT',
                createdAt: now,
                updatedAt: now,
                version: 1,
                budgetCap: 5000,
                budgetOverride: false,
                entries: [
                    { id: randomUUID(), description: 'Laptops', amount: 3200, incurredAt: now },
                ],
                viewers: [{ userId: seededUserIds.user2, access: 'VIEW' }],
                comments: [
                    { id: randomUUID(), authorId: seededUserIds.user2, text: 'Procurement started', createdAt: now, priority: 'normal' },
                ],
                metadata: { vendor: 'Lenovo' },
                status: 'APPROVED',
            },
        ];

        for (const s of seeds) this.store.set(s.id, s);
    }

    add(report: Report): void {
        this.store.set(report.id, report);
    }

    findById(id: string): Report | null {
        return this.store.get(id) ?? null;
    }

    update(id: string, updatedReport: Report): Report {
        this.store.set(id, updatedReport);
        return updatedReport;
    }

    list(): Report[] {
        return Array.from(this.store.values());
    }
}

export const globalRepo = {
    reports: new InMemoryReportRepository(),
    users: new InMemoryUserRepository(),
    // simple in-memory idempotency store for requests keyed by Idempotency-Key
    idempotency: new Map<string, { reportId: string; result: any; status: number; timestamp: string }>(),
} as const;

export type GlobalRepository = typeof globalRepo;

export default globalRepo;
