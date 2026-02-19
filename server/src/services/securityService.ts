
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import prisma from '../prisma';
import { notificationService } from './notificationService';

const execPromise = util.promisify(exec);

export const securityService = {
    /**
     * Run a Vulnerability Scan using Nmap NSE
     */
    async runVulnerabilityScan(deviceId: string) {
        const device = await prisma.device.findUnique({ where: { id: deviceId } });
        if (!device) throw new Error("Device not found");

        console.log(`Starting Vulnerability Scan for ${device.ip}...`);

        // Update device status to indicate scanning? 
        // Maybe we need a specific 'scanning_vuln' state or just use Events.
        await prisma.event.create({
            data: {
                type: 'security_scan',
                message: `Started Vulnerability Scan on ${device.name || device.ip}`,
                deviceId: device.id
            }
        });

        try {
            // Run nmap with vuln scripts
            // -sV: Version detection (needed for some vuln scripts)
            // --script vuln: Run vulnerability scripts
            // -p-: Scan all ports? Or just known open ones? 
            // Better to utilize known open ports or just default top ports for speed.
            // Let's stick to default ports + version detection for now.
            // Using -oX - for XML output might be better for parsing, but regexing stdout is easier for MVP.

            const { stdout } = await execPromise(`nmap -sV --script vuln -p 20-1000,3389,8080,8443 ${device.ip}`);

            // Parse Output for CVEs
            const riskScore = this.calculateRiskScore(stdout);
            const vulnerabilities = this.parseVulnerabilities(stdout);

            console.log(`Scan Complete. Risk Score: ${riskScore}`);

            await prisma.device.update({
                where: { id: deviceId },
                data: {
                    riskScore: riskScore,
                    vulnerabilities: JSON.stringify(vulnerabilities)
                }
            });

            await prisma.event.create({
                data: {
                    type: 'security_scan_complete',
                    message: `Vulnerability Scan completed. Found ${vulnerabilities.length} issues. Risk Score: ${riskScore}`,
                    deviceId: device.id
                }
            });

            if (riskScore > 50) {
                notificationService.add({
                    type: 'security_alert',
                    title: 'High Risk Device Detected',
                    message: `${device.name} has a risk score of ${riskScore}. Check Security tab.`,
                    metadata: { deviceId: device.id, riskScore }
                });
            }

            return { riskScore, vulnerabilities };

        } catch (error) {
            console.error("Vuln Scan Error:", error);
            await prisma.event.create({
                data: {
                    type: 'error',
                    message: `Vulnerability Scan failed: ${error}`,
                    deviceId: device.id
                }
            });
            throw error;
        }
    },

    /**
     * Start Blocking a Device (ARP Spoofing)
     * Uses Python/Scapy script
     */
    async blockDevice(deviceId: string, gatewayIp: string) {
        const device = await prisma.device.findUnique({ where: { id: deviceId } });
        if (!device) throw new Error("Device not found");

        console.log(`Blocking device: ${device.ip} via Gateway ${gatewayIp}`);

        if (this.activeBlocks.has(deviceId)) {
            console.log("Device already blocked.");
            return;
        }

        try {
            // Determine Interface
            // Naive check: ip route show (linux)
            const { stdout: routeOut } = await execPromise("ip route show default | awk '/default/ {print $5}'");
            const iface = routeOut.trim() || 'eth0';

            const scriptPath = path.join(__dirname, '../scripts/spoof.py');
            console.log(`Starting Spoofer: python3 ${scriptPath} ${device.ip} ${gatewayIp} ${iface}`);

            // Spawn Python process
            // We use 'spawn' instead of 'exec' for long-running processes
            const { spawn } = require('child_process');
            const process = spawn('python3', [scriptPath, device.ip, gatewayIp, iface]);

            process.stdout.on('data', (data: any) => console.log(`[Spoof ${device.ip}]: ${data}`));
            process.stderr.on('data', (data: any) => console.error(`[Spoof ${device.ip} Err]: ${data}`));

            this.activeBlocks.set(deviceId, process);

            process.on('error', (err: any) => {
                console.error(`Spoof process error for ${device.ip}:`, err);
                this.activeBlocks.delete(deviceId);
            });

            process.on('exit', (code: any) => {
                console.log(`Spoof process exited for ${device.ip} code ${code}`);
                this.activeBlocks.delete(deviceId);
            });

            await prisma.device.update({
                where: { id: deviceId },
                data: { isBlocked: true }
            });

            return { success: true, message: "Blocking started" };

        } catch (e) {
            console.error("Failed to start block:", e);
            throw e;
        }
    },

    /**
     * Stop Blocking
     */
    async unblockDevice(deviceId: string) {
        const process = this.activeBlocks.get(deviceId);
        if (process) {
            process.kill('SIGTERM'); // Terminate
            this.activeBlocks.delete(deviceId);
        }

        await prisma.device.update({
            where: { id: deviceId },
            data: { isBlocked: false }
        });

        console.log(`Unblocked device ${deviceId}`);
        return { success: true };
    },

    // In-memory storage for active block processes
    activeBlocks: new Map<string, any>(),

    // --- Helpers ---

    calculateRiskScore(nmapOutput: string): number {
        let score = 0;
        if (nmapOutput.includes("VULNERABLE")) score += 50;
        if (nmapOutput.includes("CVE-")) score += 20;
        // Count CVEs? 
        const cveCount = (nmapOutput.match(/CVE-\d{4}-\d+/g) || []).length;
        score += (cveCount * 10);

        return Math.min(100, score);
    },

    parseVulnerabilities(nmapOutput: string): any[] {
        const vulns: any[] = [];
        // Extract script outputs
        // Regex is fragile, but sufficient for now.
        // Look for lines containing "VULNERABLE" or "CVE"
        const lines = nmapOutput.split('\n');
        let currentScript = "";

        // Simple extraction: Key lines
        lines.forEach(line => {
            if (line.includes("| ") || line.includes("|_")) {
                if (line.includes("CVE-") || line.includes("VULNERABLE")) {
                    vulns.push(line.trim());
                }
            }
        });

        return vulns;
    },

    // --- Scheduler ---

    async initScheduler() {
        console.log("Initializing Security Scheduler...");
        // Run immediately on startup (or check last run)
        this.runScheduledScans();

        // Check every hour
        setInterval(() => this.runScheduledScans(), 60 * 60 * 1000);
    },

    async runScheduledScans() {
        try {
            const settings = await prisma.settings.findFirst();
            if (!settings || !settings.enableSecurityScan) return;

            const intervalMs = (settings.securityScanIntervalHours || 24) * 60 * 60 * 1000;
            // Check if last scan was too recent? 
            // We don't strictly track 'lastSecurityScan' in settings yet, but we can assume if it runs, it runs.
            // For a robust scheduler, we should store `lastSecurityScan` in Settings.
            // For MVP, checking every hour and seeing if (now - lastRun > interval) is best.
            // Let's add `lastSecurityScan` to Settings if possible, or just use a simple memory timestamp for now?
            // User requested robust settings.

            // Let's check `lastSecurityScan` from the DB (we need to add it to schema or mock it).
            // Schema didn't have `lastSecurityScan` in my previous edit? 
            // Correct - I missed adding `lastSecurityScan` to the schema update. 
            // I will use a simple workaround: Check the latest `Event` of type 'security_scan_complete'?
            // Or just run it if enabled and rely on the interval being checked.

            // Actually, `setInterval` running every hour is fine, but we need to persist state.
            // I'll grab the last event.
            const lastEvent = await prisma.event.findFirst({
                where: { type: 'security_scheduled_scan' },
                orderBy: { timestamp: 'desc' }
            });

            const lastRun = lastEvent ? new Date(lastEvent.timestamp).getTime() : 0;
            const now = Date.now();

            if (now - lastRun < intervalMs) {
                return; // Too soon
            }

            console.log("Running Scheduled Security Scan...");

            // Log start
            await prisma.event.create({
                data: {
                    type: 'security_scheduled_scan',
                    message: 'Scheduled Security Scan started for all active devices.'
                }
            });

            // Get all devices
            const devices = await prisma.device.findMany({ where: { status: 'online' } });

            // Run sequentially to save resources
            for (const device of devices) {
                try {
                    await this.runVulnerabilityScan(device.id);
                } catch (e) {
                    console.error(`Scheduled scan failed for ${device.name}`, e);
                }
            }

        } catch (e) {
            console.error("Security Scheduler Error:", e);
        }
    }
};
