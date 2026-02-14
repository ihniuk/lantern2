import express from 'express';
import prisma from '../prisma';
import { runScan, scanDeviceDetails } from '../services/scanner';

const router = express.Router();

// Status route
router.get('/status', async (req, res) => {
    try {
        const { getScanStatus } = require('../services/scanner');
        res.json(getScanStatus());
    } catch (e) {
        res.status(500).json({ error: 'Failed to get status' });
    }
});

// GET all devices
router.get('/', async (req, res) => {
    const devices = await prisma.device.findMany({
        orderBy: {
            ip: 'asc' // IP sorting might be string-based, need custom sort logic or raw SQL if precise
        }
    });
    // Manual sort for IPs to be correct 1.2 vs 1.10
    devices.sort((a, b) => {
        const numA = a.ip.split('.').map(Number);
        const numB = b.ip.split('.').map(Number);
        for (let i = 0; i < 4; i++) {
            if (numA[i] !== numB[i]) return numA[i] - numB[i];
        }
        return 0;
    });

    // Parse tags
    devices.forEach(d => {
        if (d.tags) {
            try { (d as any).tags = JSON.parse(d.tags); } catch (e) { (d as any).tags = []; }
        }
    });

    res.json(devices);
});

// GET single device
router.get('/:id', async (req, res) => {
    const device = await prisma.device.findUnique({
        where: { id: req.params.id },
        include: {
            ports: true,
            events: { orderBy: { timestamp: 'desc' }, take: 50 },
            history: { orderBy: { timestamp: 'asc' }, take: 200 }
        } // history asc for graph
    });
    if (device && device.tags) {
        try { (device as any).tags = JSON.parse(device.tags); } catch (e) { (device as any).tags = []; }
    }
    res.json(device);
});

// Update device (PATCH)
router.patch('/:id', async (req, res) => {
    const { customName, customIcon, customVendor, customType, customOS, tags } = req.body;
    try {
        const device = await prisma.device.update({
            where: { id: req.params.id },
            data: {
                customName,
                customIcon,
                customVendor,
                customType,
                customOS,
                tags: tags ? JSON.stringify(tags) : undefined
            }
        });
        // Parse tags back for response so client receives array
        if (device.tags) {
            try {
                (device as any).tags = JSON.parse(device.tags);
            } catch (e) { }
        }
        res.json(device);
    } catch (e) {
        res.status(500).json({ error: "Failed to update device" });
    }
});
router.put('/:id', async (req, res) => {
    const { name, type, vendor } = req.body;
    const device = await prisma.device.update({
        where: { id: req.params.id },
        data: { name, type, vendor }
    });
    res.json(device);
});

// Manual Scan
router.post('/scan', async (req, res) => {
    runScan();
    res.json({ message: 'Scan started' });
});

// Delete single device
router.delete('/:id', async (req, res) => {
    try {
        const id = req.params.id;
        // Clean up related data first
        await prisma.port.deleteMany({ where: { deviceId: id } });
        await prisma.deviceHistory.deleteMany({ where: { deviceId: id } });
        await prisma.event.deleteMany({ where: { deviceId: id } });

        await prisma.device.delete({ where: { id } });
        res.json({ message: 'Device deleted' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to delete device' });
    }
});

// Clear all devices
router.delete('/', async (req, res) => {
    try {
        await prisma.port.deleteMany({});
        await prisma.event.deleteMany({});
        await prisma.device.deleteMany({});
        res.json({ message: 'All devices cleared' });
    } catch (e) {
        res.status(500).json({ error: 'Failed to clear devices' });
    }
});

import { exec } from 'child_process';
import util from 'util';
const execPromise = util.promisify(exec);

// Action (Ping, Port Scan, WOL)
router.post('/:id/action', async (req, res) => {
    const { type } = req.body; // 'ping', 'portscan', 'wol'
    const device = await prisma.device.findUnique({ where: { id: req.params.id } });

    if (!device) return res.status(404).json({ error: "Device not found" });

    if (type === 'portscan') {
        scanDeviceDetails(device);
        return res.json({ message: 'Port scan started' });
    }

    if (type === 'ping') {
        try {
            // Ping 4 times, 1s timeout
            const { stdout } = await execPromise(`ping -c 4 -W 1 ${device.ip}`);
            return res.json({ output: stdout });
        } catch (e: any) {
            // Ping might fail (exit code 1), still return output
            return res.json({ output: e.stdout || e.message });
        }
    }

    if (type === 'wol') {
        // Simple WOL if possible or placeholder
        try {
            // Need 'wakeonlan' package or similar tool installed in docker
            // For now just logging
            console.log(`Sending WOL packet to ${device.mac}`);
            return res.json({ message: `WOL packet sent to ${device.mac} (Simulation)` });
        } catch (e) {
            return res.json({ error: 'WOL failed' });
        }
    }

    if (type === 'test_event') {
        try {
            const event = await prisma.event.create({
                data: {
                    type: 'test',
                    message: `Manual Test Event triggered at ${new Date().toLocaleTimeString()}`,
                    deviceId: device.id,
                    timestamp: new Date()
                }
            });
            return res.json({ message: 'Test event created', event });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Failed to create test event' });
        }
    }

    res.json({ message: `Action ${type} triggered for ${device.ip}` });
});

export default router;
