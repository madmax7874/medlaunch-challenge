import { Router } from 'express';
import { createReport, getReport, listReports, updateReport, addComment } from '../controllers/reportController';
import { authMiddleware, requireRole } from '../middleware/auth';

const router = Router();

// All report endpoints require authentication. Roles:
// - USER: can GET and create their own reports
// - ADMIN: can act on any
router.get('/', authMiddleware, requireRole('USER', 'ADMIN'), listReports);
router.get('/:id', authMiddleware, requireRole('USER', 'ADMIN'), getReport);
router.post('/', authMiddleware, requireRole('USER', 'ADMIN'), createReport);
router.post('/:id/comment', authMiddleware, requireRole('USER', 'ADMIN'), addComment);
router.put('/:id', authMiddleware, requireRole('USER', 'ADMIN'), updateReport);

export default router;
