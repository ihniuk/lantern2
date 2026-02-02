import { Router, Request, Response } from 'express';
import { notificationService } from '../services/notificationService';

const router = Router();

// Get all notifications
router.get('/', (req: Request, res: Response) => {
    try {
        const notifications = notificationService.getAll();
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Clear all notifications
router.post('/clear', (req: Request, res: Response) => {
    try {
        notificationService.clear();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear notifications' });
    }
});

// Delete specific notification
router.delete('/:id', (req: Request, res: Response) => {
    try {
        notificationService.remove(req.params.id as string);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete notification' });
    }
});

// Mark as read
router.post('/:id/read', (req: Request, res: Response) => {
    try {
        notificationService.markAsRead(req.params.id as string);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark as read' });
    }
});

export default router;
