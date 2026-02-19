
import express from 'express';
import { securityService } from '../services/securityService';
import prisma from '../prisma';

const router = express.Router();

// Trigger Vulnerability Scan
router.post('/scan/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Run asynchronously, don't wait for completion
        securityService.runVulnerabilityScan(id).catch(e => console.error(e));
        res.json({ message: 'Vulnerability scan started' });
    } catch (e: any) {
        res.status(500).json({ error: e.message || 'Failed to start scan' });
    }
});

// Block Device
router.post('/block/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { gateway } = req.body; // optionally pass gateway, or detect

        // Find gateway from settings or auto-detect? 
        // For now, let's assume valid gateway is passed or we find router in DB
        // Finding router in DB:
        let gatewayIp = gateway;
        if (!gatewayIp) {
            const router = await prisma.device.findFirst({ where: { type: 'router' } });
            if (router) gatewayIp = router.ip;
        }

        if (!gatewayIp) {
            // Fallback: X.X.X.1 of the device subnet?
            return res.status(400).json({ error: 'Gateway IP required or not found' });
        }

        await securityService.blockDevice(id, gatewayIp);
        res.json({ message: 'Device blocking initiated' });
    } catch (e: any) {
        res.status(500).json({ error: e.message || 'Failed to block device' });
    }
});

// Unblock Device
router.post('/unblock/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await securityService.unblockDevice(id);
        res.json({ message: 'Device unblocked' });
    } catch (e: any) {
        res.status(500).json({ error: e.message || 'Failed to unblock device' });
    }
});

// Ignore/Acknowledge Risk
router.post('/ignore/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const device = await prisma.device.findUnique({ where: { id } });
        if (!device) return res.status(404).json({ error: 'Device not found' });

        await prisma.device.update({
            where: { id },
            data: { ignoredRiskScore: device.riskScore }
        });

        res.json({ message: 'Risk acknowledged' });
    } catch (e: any) {
        res.status(500).json({ error: e.message || 'Failed to ignore risk' });
    }
});

export default router;
