import { Request, Response } from 'express';
import globalRepo from '../repositories/globalRepository';
import { toReportView, computeTotalAmount } from '../services/reportService';
import { JwtPayload } from '../middleware/auth';
import { getReportsByUser, Report, createReport as modelCreateReport } from '../models/report';
import { randomUUID } from 'crypto';

const repo = globalRepo.reports;

export async function createReport(req: Request, res: Response) {
    try {
        const payload = req.body;
        const user = (req as any).user as JwtPayload | undefined;
        if (!payload || !payload.title || typeof payload.budgetCap !== 'number') {
            return res.status(400).json({ error: 'Missing required fields: title, budgetCap' });
        }

        // Determine ownerId: prefer payload.ownerId, but if not present, use authenticated user
        let ownerId = payload.ownerId;
        if (!ownerId && user) ownerId = user.id;
        if (!ownerId) return res.status(400).json({ error: 'ownerId required or authentication required' });

        // Role enforcement: non-admin USERS may only create reports for themselves
        if (user && user.role === 'USER' && ownerId !== user.id) {
            return res.status(403).json({ error: 'Users may only create reports for themselves' });
        }

        // Prevent non-admins from setting budgetOverride to true
        if (payload.budgetOverride === true && (!user || user.role !== 'ADMIN')) {
            return res.status(403).json({ error: 'Forbidden', message: 'Only ADMIN may set budgetOverride' });
        }

        // If creating in SUBMITTED state, enforce Strict Budget Gate
        const initialEntries = Array.isArray(payload.entries) ? payload.entries : [];
        const initialTotal = computeTotalAmount({
            ...payload,
            entries: initialEntries,
            id: 'temp',
            ownerId: ownerId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: 1,
        } as any);
        const initialBudgetOverride = !!payload.budgetOverride;
        if ((payload.status === 'SUBMITTED' || payload.status === 'submitted') && initialTotal > payload.budgetCap && !initialBudgetOverride) {
            return res.status(400).json({ error: 'BudgetExceeded', message: 'Report total exceeds budgetCap and budgetOverride is not set' });
        }

        // normalize viewers: accept array of strings or array of objects
        let viewersForCreate: any[] = [];
        if (Array.isArray(payload.viewers)) {
            const arr = payload.viewers as any[];
            if (arr.length > 0 && typeof arr[0] === 'string') {
                viewersForCreate = arr.map((u: string) => ({ userId: u, access: 'VIEW' }));
            } else {
                viewersForCreate = arr;
            }
        }

        const rec = await modelCreateReport(
            payload.title,
            ownerId,
            payload.budgetCap,
            payload.department,
            Array.isArray(payload.entries) ? payload.entries : [],
            viewersForCreate,
            payload.status || 'DRAFT',
            !!payload.budgetOverride,
        );
        return res.status(201).json(toReportView(rec));
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        return res.status(500).json({ error: 'InternalError' });
    }
}

export async function getReport(req: Request, res: Response) {
    try {
        const id = req.params.id;
        const rec = await repo.findById(id);
        if (!rec) return res.status(404).json({ error: 'NotFound' });
        const user = (req as any).user as JwtPayload | undefined;
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        // Authorization: admin sees all, user sees own or if listed
            const canAccess = ((): boolean => {
                if (user.role === 'ADMIN') return true;
                    if (user.role === 'USER') return rec.ownerId === user.id || (Array.isArray(rec.viewers) && rec.viewers.some((v) => v.userId === user.id));
                return false;
            })();
        if (!canAccess) return res.status(403).json({ error: 'Forbidden' });

        // Parse view options from query params
        const { include, view, entriesPage, entriesSize, entriesSort, entriesMinAmount } = req.query || {};
        const includeList = typeof include === 'string' ? include.split(',').map((s) => s.trim()) : undefined;
        const compact = view === 'compact' || view === 'summary';
        const opts: any = {
            include: includeList,
            compact,
        };
        if (entriesPage) opts.entriesPage = Number(entriesPage);
        if (entriesSize) opts.entriesSize = Number(entriesSize);
        if (entriesSort && typeof entriesSort === 'string') opts.entriesSort = entriesSort as any;
        if (entriesMinAmount) opts.entriesMinAmount = Number(entriesMinAmount);

        const shaped = toReportView(rec, opts);
        return res.json(shaped);
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        return res.status(500).json({ error: 'InternalError' });
    }
}

export async function listReports(_req: Request, res: Response) {
    try {
        const user = (_req as any).user as JwtPayload | undefined;
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        let reports: Report[] =await getReportsByUser(user.id, user.role);

        return res.json(reports.map((r) => toReportView(r)));
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        return res.status(500).json({ error: 'InternalError' });
    }
}

export async function updateReport(req: Request, res: Response) {
    try {
        const id = req.params.id;
        const payload = req.body as Partial<Report> & { version?: number };
        const user = (req as any).user as JwtPayload | undefined;
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const existing = await repo.findById(id);
        if (!existing) return res.status(404).json({ error: 'NotFound' });

        // Role checks: USER can only update their own reports
        if (user.role === 'USER' && existing.ownerId !== user.id) {
            return res.status(403).json({ error: 'Forbidden', message: 'Users can only update their own reports' });
        }

        // normalize viewers: accept array of strings or array of objects
        let viewersNormalized: any[] | undefined;
        if (Array.isArray(payload.viewers)) {
            const arr = payload.viewers as any[];
            if (arr.length > 0 && typeof arr[0] === 'string') viewersNormalized = arr.map((u: string) => ({ userId: u, access: 'VIEW' }));
            else viewersNormalized = arr;
        }
        // Only ADMIN may set budgetOverride to true
        if (payload.budgetOverride === true && user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Forbidden', message: 'Only ADMIN may set budgetOverride' });
        }

        // Determine expected version from If-Match header or body.version
        let expectedVersion: number | undefined;
        const ifMatch = req.header('If-Match');
        if (ifMatch) {
            const num = Number(ifMatch.replace(/"/g, ''));
            if (!Number.isNaN(num)) expectedVersion = num;
        }
        if (expectedVersion === undefined && typeof payload.version === 'number') expectedVersion = payload.version;
        if (expectedVersion === undefined) {
            return res.status(400).json({ error: 'MissingVersion', message: 'Provide If-Match header or version in body' });
        }

        // Build partial update -- whitelist allowed fields
        const updated: Partial<Report> = {};
        if (payload.title !== undefined) updated.title = payload.title;
        if (payload.department !== undefined) updated.department = payload.department;
        if (payload.budgetCap !== undefined) updated.budgetCap = payload.budgetCap;
        if (payload.budgetOverride !== undefined) updated.budgetOverride = payload.budgetOverride;
        if (payload.entries !== undefined) updated.entries = payload.entries;
        if (viewersNormalized !== undefined) updated.viewers = viewersNormalized;
        if (payload.status !== undefined) updated.status = payload.status;

        // Only ADMIN may change ownerId
        if (payload.ownerId !== undefined) {
            if (user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden', message: 'Only ADMIN may change owner' });
            updated.ownerId = payload.ownerId;
        }

        // If transitioning from DRAFT -> SUBMITTED, enforce Strict Budget Gate
        const willChangeToSubmitted = existing.status === 'DRAFT' && updated.status === 'SUBMITTED';
        if (willChangeToSubmitted) {
            const entriesToCheck = updated.entries ?? existing.entries;
            const budgetCapToCheck = updated.budgetCap ?? existing.budgetCap;
            const overrideToCheck = updated.budgetOverride ?? existing.budgetOverride;
            const total = computeTotalAmount({ ...existing, entries: entriesToCheck } as any);
            if (total > budgetCapToCheck && !overrideToCheck) {
                return res.status(400).json({ error: 'BudgetExceeded', message: 'Cannot submit report: total exceeds budgetCap and budgetOverride not set' });
            }
        }

        try {
            const result = await repo.update(id, updated, expectedVersion);
            return res.json(toReportView(result));
        } catch (err: any) {
            if (err && err.code === 'VERSION_MISMATCH') return res.status(409).json({ error: 'VersionMismatch' });
            throw err;
        }
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        return res.status(500).json({ error: 'InternalError' });
    }
}

export async function addComment(req: Request, res: Response) {
    try {
        const id = req.params.id;
        const payload = req.body as { text?: string; priority?: 'low' | 'normal' | 'high' } | undefined;
        const user = (req as any).user as JwtPayload | undefined;
        if (!user) return res.status(401).json({ error: 'Unauthorized' });
        if (!payload || !payload.text || typeof payload.text !== 'string') return res.status(400).json({ error: 'MissingField', message: 'text is required' });

        const existing = await repo.findById(id);
        if (!existing) return res.status(404).json({ error: 'NotFound' });

        // Permission: ADMIN allowed; owner allowed; viewers with COMMENT or EDIT access allowed
        const allowed = (() => {
            if (user.role === 'ADMIN') return true;
            if (existing.ownerId === user.id) return true;
            return Array.isArray(existing.viewers) && existing.viewers.some((v) => v.userId === user.id && (v.access === 'COMMENT' || v.access === 'EDIT'));
        })();
        if (!allowed) return res.status(403).json({ error: 'Forbidden' });

        const now = new Date().toISOString();
        const newComment = {
            id: randomUUID(),
            authorId: user.id,
            text: payload.text,
            createdAt: now,
            priority: payload.priority || 'normal',
        };

        const updatedComments = [...(existing.comments || []), newComment];
        const updated = await repo.update(id, { comments: updatedComments });
        return res.status(201).json(toReportView(updated));
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        return res.status(500).json({ error: 'InternalError' });
    }
}
