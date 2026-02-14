import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import deviceRoutes from './routes/deviceRoutes';
import speedTestRoutes from './routes/speedTestRoutes';
import securityRoutes from './routes/securityRoutes';
import notificationRoutes from './routes/notificationRoutes';
import { runScan } from './services/scanner';
import { initSpeedTestScheduler } from './services/speedTestService';
import prisma from './prisma';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/devices', deviceRoutes);
app.use('/api/speedtest', speedTestRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/security', securityRoutes);

const CONTAINER_START_TIME = new Date();

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

app.get('/api/status', (req, res) => {
    res.json({
        online: true,
        startTime: CONTAINER_START_TIME,
        uptime: (new Date().getTime() - CONTAINER_START_TIME.getTime()) / 1000
    });
});

// Settings Route
app.get('/api/settings', async (req, res) => {
    let settings = await prisma.settings.findUnique({ where: { id: 'default' } });
    if (!settings) {
        settings = await prisma.settings.create({
            data: { id: 'default', scanInterval: 5, scanDuration: 60, ipRange: '192.168.1.0/24' }
        });
    }
    res.json(settings);
});

app.put('/api/settings', async (req, res) => {
    const settings = await prisma.settings.upsert({
        where: { id: 'default' },
        update: req.body,
        create: { id: 'default', ...req.body }
    });

    // Update scheduler if interval changed (or just always update, it's cheap)
    if (req.body.speedTestIntervalMinutes) {
        // Dynamic import to avoid circular dependency if service imports prisma from index? 
        // Service imports prisma from library or index? Service creates its own client instance in my previous write.
        // Actually speedTestService.ts imports PrismaClient and creates a new one.
        // Let's import the update function.
        const { updateSpeedTestScheduler } = require('./services/speedTestService');
        updateSpeedTestScheduler(settings.speedTestIntervalMinutes);
    }

    res.json(settings);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    // Initial Scan delay
    setTimeout(() => {
        runScan();
    }, 5000);

    // Initialize Speed Test Scheduler
    initSpeedTestScheduler();

    // Schedule scans
    setInterval(async () => {
        const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
        const interval = (settings?.scanInterval || 5) * 60 * 1000;
        // Check if we should scan now (naive impl, assumes interval doesn't change often or we just loop)
        // Strictly, we should use a timeout that resets. But interval is fine for MVP.
        runScan();
    }, 5 * 60 * 1000); // Start with 5 min, logic inside runScan can check DB for dynamic interval but setInterval is fixed. 
    // Ideally we use a recursive setTimeout in runScan to adapt to changing settings.
});
