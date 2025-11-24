import { Router } from 'express';
import { createReport, getReport, listReports, updateReport, addComment, uploadAttachment, getAttachmentUrl, downloadAttachment } from '../controllers/reportController';
import { authMiddleware, requireRole } from '../middleware/auth';

const router = Router();

router.get('/', authMiddleware, requireRole('USER', 'ADMIN'), listReports);
router.post('/', authMiddleware, requireRole('USER', 'ADMIN'), createReport);
router.get('/:id', authMiddleware, requireRole('USER', 'ADMIN'), getReport);
router.put('/:id', authMiddleware, requireRole('USER', 'ADMIN'), updateReport);
router.post('/:id/comment', authMiddleware, requireRole('USER', 'ADMIN'), addComment);
router.post('/:id/attachment', authMiddleware, requireRole('USER', 'ADMIN'), uploadAttachment);
router.get('/:id/attachments/:attachmentId/url', authMiddleware, requireRole('USER', 'ADMIN'), getAttachmentUrl);
router.get('/attachments/download', downloadAttachment);

export default router;
