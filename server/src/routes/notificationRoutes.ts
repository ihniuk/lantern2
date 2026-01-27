import { Router } from 'express';
import prisma from '../prisma';
import { getVapidPublicKey } from '../services/notifications';

const router = Router();

// Get Public Key
router.get('/vapid', (req, res) => {
    res.json({ publicKey: getVapidPublicKey() });
});

// Subscribe
router.post('/subscribe', async (req, res) => {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: 'Invalid subscription' });
    }

    try {
        const existing = await prisma.pushSubscription.findUnique({
            where: { endpoint: subscription.endpoint }
        });

        if (!existing) {
            await prisma.pushSubscription.create({
                data: {
                    endpoint: subscription.endpoint,
                    keys: JSON.stringify(subscription.keys)
                }
            });
        }
        res.status(201).json({ success: true });
    } catch (error) {
        console.error('Subscription error', error);
        res.status(500).json({ error: 'Failed' });
    }
});

export default router;
