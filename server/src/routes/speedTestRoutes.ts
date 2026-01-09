import express from 'express';
import prisma from '../prisma';
import { runSpeedTest } from '../services/speedTestService';

const router = express.Router();

// Run manual test
router.post('/run', async (req, res) => {
    try {
        const result = await runSpeedTest();
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message || 'Speed test failed' });
    }
});

// Get history
router.get('/history', async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
        const history = await prisma.speedTestResult.findMany({
            orderBy: { timestamp: 'desc' },
            take: limit
        });
        res.json(history);
    } catch (e: any) {
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// Get stats
router.get('/stats', async (req, res) => {
    try {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

        const getAvg = async (since: Date) => {
            const aggs = await prisma.speedTestResult.aggregate({
                _avg: {
                    download: true,
                    upload: true,
                    ping: true
                },
                where: {
                    timestamp: { gte: since }
                }
            });
            return aggs._avg;
        };

        const [day, week, month, year] = await Promise.all([
            getAvg(oneDayAgo),
            getAvg(oneWeekAgo),
            getAvg(oneMonthAgo),
            getAvg(oneYearAgo)
        ]);

        res.json({ day, week, month, year });
    } catch (e: any) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

export default router;
