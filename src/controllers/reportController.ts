import { Request, Response } from 'express';
import globalRepo from '../repositories/globalRepository';
import { toReportView, computeTotalAmount } from '../services/reportService';
import { JwtPayload } from '../middleware/auth';
import { getReportsByUser, Report, createReport as modelCreateReport } from '../models/report';
import JobQueueService from '../services/jobQueueService'; 
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import upload from '../services/fileStorageService';
import multer from 'multer';
import fs from "fs";

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

        // --- Asynchronous Side Effect ---
        // Enqueue a background job to handle post-creation tasks like notifications.
        // This happens after the report is successfully created but before we respond to the client.
        // The `enqueue` operation should be fast and not block the response.
        try {
            await JobQueueService.enqueue({
                type: 'REPORT_CREATED',
                payload: {
                    reportId: rec.id,
                    ownerId: rec.ownerId,
                    createdAt: rec.createdAt,
                },
            });
        } catch (jobError) {
            // If enqueuing fails, it's a critical issue (e.g., message broker is down).
            // We should log this as a high-priority error for immediate investigation.
            // However, we don't fail the user's request, as the primary operation (creating the report) succeeded.
            console.error('CRITICAL: Failed to enqueue REPORT_CREATED job.', jobError);
        }

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
        const { include, compact, offset, limit, entriesSort, entriesMinAmount } = req.query || {};
        const includeList = typeof include === 'string' ? include.split(',').map((s) => s.trim()) : undefined;
        const compactBool = compact === '1';
        const opts: any = {
            include: includeList,
            compact: compactBool,
        };
        if (offset) opts.offset = Number(offset);
        if (limit) opts.limit = Number(limit);
        if (entriesSort && typeof entriesSort === 'string') opts.entriesSort = entriesSort as any;
        if (entriesMinAmount) opts.entriesMinAmount = Number(entriesMinAmount);

        let shaped = toReportView(rec, opts);
        if (compactBool) {
            // Remove viewers/comments from summary
            delete shaped.viewers;
            delete shaped.comments;
        }
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

        let reports: Report[] = await getReportsByUser(user.id, user.role);

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

const uploadMiddleware = upload.single('attachment');
export async function uploadAttachment(req: Request, res: Response) {
    // We execute the upload middleware manually here to handle errors
    uploadMiddleware(req, res, async (err: any) => {
        
        // --- ERROR HANDLING (Multer & Validation) ---
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'File too large. Maximum limit is 5MB.' });
            }
            return res.status(400).json({ error: err.message });
        } else if (err) {
            return res.status(400).json({ error: err.message }); // Handles "Only PDF is allowed"
        }

        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            console.log(`File saved to: ${req.file.path}`);

            const id = req.params.id;
            const existing = await repo.findById(id);
            if (!existing) return res.status(404).json({ error: 'NotFound' });

            const user = (req as any).user as JwtPayload | undefined;
            if (!user) return res.status(401).json({ error: 'Unauthorized' });

            // Permission Check
            const allowed = (() => {
                if (user.role === 'ADMIN') return true;
                if (existing.ownerId === user.id) return true;
                return Array.isArray(existing.viewers) && existing.viewers.some((v) => v.userId === user.id && v.access === 'EDIT');
            })();
            if (!allowed) return res.status(403).json({ error: 'Forbidden' });

            // Add attachment metadata
            const newAttachment = {
                id: randomUUID(),
                filename: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                storagePath: req.file.path,
                uploadedAt: new Date().toISOString(),
                owner: user.id,
            };

            const updatedAttachments = [...(existing.attachments || []), newAttachment];
            const updated = await repo.update(id, { attachments: updatedAttachments });

            return res.status(201).json(toReportView(updated));

        } catch (innerErr) {
            // eslint-disable-next-line no-console
            console.error(innerErr);
            return res.status(500).json({ error: 'InternalError' });
        }
    });
}

export async function getAttachmentUrl(req: Request, res: Response) {
    try {
        const { id, attachmentId } = req.params;

        // 1. Fetch Metadata
        const report = await repo.findById(id);
        if (!report) return res.status(404).json({ error: 'Report not found' });

        const attachment = report.attachments?.find(a => a.id === attachmentId);
        if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

        // 2. Check Permissions (Same logic as Upload)
        const user = (req as any).user as JwtPayload | undefined;
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const allowed = (() => {
            if (user.role === 'ADMIN') return true;
            if (report.ownerId === user.id) return true;
            return Array.isArray(report.viewers) && report.viewers.some((v) => v.userId === user.id);
        })();

        if (!allowed) return res.status(403).json({ error: 'Forbidden' });

        // 3. Create the Signed Token
        // We embed the file path inside the token so the download endpoint doesn't need a DB lookup
        const tokenPayload = {
            filePath: attachment.storagePath,
            originalName: attachment.filename,
            mimeType: attachment.mimetype
        };

        const signedToken = jwt.sign(tokenPayload, process.env.JWT_SECRET || 'medlaunch', { expiresIn: "1d" });

        // 4. Return the complete URL
        // In production, use your actual domain env variable
        const downloadUrl = `${req.protocol}://${req.get('host')}/reports/attachments/download?token=${signedToken}`;

        return res.status(200).json({ 
            url: downloadUrl,
            expiresIn: "1d" 
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'InternalError' });
    }
}

export async function downloadAttachment(req: Request, res: Response) {
    try {
        const { token } = req.query;

        if (!token || typeof token !== 'string') {
            return res.status(400).json({ error: 'Missing token' });
        }

        // 1. Verify the Token
        let payload: any;
        try {
            payload = jwt.verify(token, process.env.JWT_SECRET || 'medlaunch');
        } catch (e) {
            return res.status(403).json({ error: 'Link expired or invalid' });
        }

        // 2. Verify File Exists
        if (!fs.existsSync(payload.filePath)) {
            return res.status(410).json({ error: 'File no longer exists' });
        }

        // 3. Stream the File
        // 'res.download' automatically sets Content-Disposition and handles streams
        res.download(payload.filePath, payload.originalName, (err) => {
            if (err) {
                // Handle cases where the client aborts download mid-stream
                if (!res.headersSent) {
                    res.status(500).send({ error: 'Could not download file' });
                }
            }
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'InternalError' });
    }
}