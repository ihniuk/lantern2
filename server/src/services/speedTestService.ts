import { exec } from 'child_process';
import { PrismaClient } from '@prisma/client';
import cron from 'node-cron';
import util from 'util';

const execPromise = util.promisify(exec);
const prisma = new PrismaClient();

interface SpeedTestResultRaw {
    timestamp: string;
    ping: { jitter: number; latency: number };
    download: { bandwidth: number; bytes: number; elapsed: number };
    upload: { bandwidth: number; bytes: number; elapsed: number };
    packetLoss?: number;
    isp: string;
    server: { id: number; name: string; location: string; country: string; host: string };
    result: { id: string; url: string };
}

export const runSpeedTest = async () => {
    console.log('Running internet speed test...');
    try {
        // Run Ookla speedtest CLI outputting JSON
        // bandwidth is in bytes/sec, we want Mbps (bytes * 8 / 1,000,000)
        const { stdout, stderr } = await execPromise('speedtest --accept-license --accept-gdpr --format=json');

        if (stderr) {
            console.error('Speedtest stderr:', stderr);
        }

        const result: SpeedTestResultRaw = JSON.parse(stdout);

        // Convert bandwidth (bytes/sec) to Mbps
        const downloadMbps = (result.download.bandwidth * 8) / 1000000;
        const uploadMbps = (result.upload.bandwidth * 8) / 1000000;

        const saved = await prisma.speedTestResult.create({
            data: {
                timestamp: new Date(result.timestamp),
                ping: result.ping.latency,
                jitter: result.ping.jitter,
                download: parseFloat(downloadMbps.toFixed(2)),
                upload: parseFloat(uploadMbps.toFixed(2)),
                packetLoss: result.packetLoss,
                isp: result.isp,
                serverLocation: `${result.server.name}, ${result.server.location}`
            }
        });

        console.log(`Speed test completed: DL ${saved.download} Mbps / UL ${saved.upload} Mbps`);

        // Check for significant speed drop (>20% below 7-day average)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const recentTests = await prisma.speedTestResult.findMany({
            where: {
                timestamp: { gte: sevenDaysAgo },
                id: { not: saved.id } // Exclude current
            },
            select: { download: true }
        });

        if (recentTests.length > 0) {
            const totalDownload = recentTests.reduce((sum, t) => sum + t.download, 0);
            const averageDownload = totalDownload / recentTests.length;

            if (saved.download < averageDownload * 0.8) {
                const dropPercent = Math.round(((averageDownload - saved.download) / averageDownload) * 100);

                // Get settings to check preference (import at top needed or fetch here)
                const settings = await prisma.settings.findUnique({ where: { id: 'default' } });

                if (settings?.notifySpeedDrop) {
                    const { notificationService } = await import('./notificationService');
                    notificationService.add({
                        type: 'speed_drop',
                        title: 'Internet Speed Drop',
                        message: `Download speed dropped by ${dropPercent}% (${saved.download} Mbps vs avg ${averageDownload.toFixed(1)} Mbps).`
                    });
                }
            }
        }

        return saved;

    } catch (error) {
        console.error('Failed to run speed test:', error);
        throw error;
    }
};

let currentTask: cron.ScheduledTask | null = null;

export const scheduleSpeedTest = (intervalMinutes: number) => {
    if (currentTask) {
        currentTask.stop();
        currentTask = null;
    }

    if (intervalMinutes <= 0) {
        console.log('Speed test scheduler disabled.');
        return;
    }

    // Convert minutes to cron expression (e.g. "*/60 * * * *" for every 60 mins)
    // Actually, node-cron doesn't support "every X minutes" easily if X > 59 via standard syntax for "*/X".
    // "*/60" is invalid for minutes field (0-59).
    // If interval < 60, we utilize "*/X * * * *".
    // If interval >= 60, it gets complicated. 
    // For simplicity, let's use a meaningful defaults or just use setInterval wrapper if cron is too complex for arbitrary minutes.
    // Or we can stick to cron for specific patterns. 
    // A robust way for arbitrary interval is `setInterval`. node-cron is good for "at 5pm".
    // Let's switch to setInterval for "every X minutes" semantics which fits user expectation better.

    // However, the previous impl used cron '0 * * * *' (hourly).
    // Let's go with a recursive setTimeout or setInterval to be safe for any minute value.

    console.log(`Scheduling speed test every ${intervalMinutes} minutes.`);

    // clear any existing interval if we were using it (we used cron before, now using object reference)
    // Since we are switching implementation, let's just use a class-level variable.
};

// Re-implementing with a robust interval handler
let intervalHandle: NodeJS.Timeout | null = null;

export const updateSpeedTestScheduler = (intervalMinutes: number) => {
    if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
    }

    if (intervalMinutes <= 0) {
        console.log('Speed test scheduler disabled.');
        return;
    }

    console.log(`Speed test scheduler set to every ${intervalMinutes} minutes.`);

    intervalHandle = setInterval(() => {
        runSpeedTest().catch(err => console.error('Scheduled speed test failed', err));
    }, intervalMinutes * 60 * 1000);
};

export const initSpeedTestScheduler = async () => {
    // Fetch settings to get interval
    try {
        const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
        const interval = settings?.speedTestIntervalMinutes || 60;
        updateSpeedTestScheduler(interval);
    } catch (e) {
        console.error('Failed to init speed test scheduler', e);
        // Fallback
        updateSpeedTestScheduler(60);
    }
};
