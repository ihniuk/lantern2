import prisma from '../prisma';
import nmap from 'node-nmap';
import { exec } from 'child_process';
import util from 'util';
import os from 'os';

const execPromise = util.promisify(exec);

// Function to get local subnet automatically if not configured
// This is a naive implementation, ideally we parse interface info
async function getLocalSubnet(): Promise<string> {
    const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
    if (settings?.ipRange) return settings.ipRange;

    // Fallback: assume 192.168.1.0/24 or verify via shell command (ip addr)
    // For now returning a default common subnet, will enhance later
    return '192.168.1.0/24';
}

// Helper to guess type based on vendor/os
function guessType(vendor?: string, os?: string): string {
    const v = (vendor || '').toLowerCase();
    const o = (os || '').toLowerCase();

    if (v.includes('apple')) return 'mobile'; // Or laptop, hard to say, default to mobile/tablet
    if (v.includes('samsung') || v.includes('motorola') || v.includes('google') || v.includes('xiaomi')) return 'mobile';
    if (v.includes('dell') || v.includes('hp') || v.includes('lenovo')) return 'laptop';
    if (v.includes('philips') || v.includes('hue') || v.includes('nest')) return 'iot';
    if (v.includes('ubiquiti') || v.includes('cisco') || v.includes('tplink') || v.includes('netgear')) return 'router';
    if (v.includes('raspberry') || v.includes('arduino')) return 'iot';
    if (v.includes('synology') || v.includes('qnap')) return 'server';

    if (o.includes('windows')) return 'laptop'; // or desktop
    if (o.includes('linux')) return 'server'; // broad assumption

    return 'unknown';
}

import dns from 'dns';
const reverseDns = util.promisify(dns.reverse);
const { Resolver } = dns;

// NetBIOS Lookup Helper
async function getNetbiosName(ip: string): Promise<string | null> {
    try {
        const { stdout } = await execPromise(`nmblookup -A ${ip}`);
        // Output format:
        // Looking up status of 192.168.1.10
        //         MY-PC           <00> -         B <ACTIVE>
        //         WORKGROUP       <00> - <GROUP> B <ACTIVE>
        // Regex: Find a name followed by <00> that does NOT have <GROUP> in the same line
        const lines = stdout.split('\n');
        for (const line of lines) {
            if (line.includes('<00>') && !line.includes('<GROUP>')) {
                const match = line.match(/^\s+([a-zA-Z0-9_\-]+)\s+/);
                if (match && match[1]) return match[1];
            }
        }
        return null;
    } catch (e) { return null; }
}

// Scan State
let isScanning = false;
let scanLogs: string[] = [];

export function getScanStatus() {
    return {
        isScanning,
        logs: scanLogs
    };
}

function log(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    const line = `[${timestamp}] ${message}`;
    console.log(line);
    scanLogs.push(line);
    if (scanLogs.length > 50) scanLogs.shift(); // Keep last 50 lines
}

export async function runScan() {
    if (isScanning) return;
    isScanning = true;
    scanLogs = []; // Clear old logs
    log('Initiating Network Scan...');

    try {
        const startTime = Date.now();
        const subnet = await getLocalSubnet();
        const settings = await prisma.settings.findUnique({ where: { id: 'default' } });

        // Configure improved DNS resolver
        const resolver = new Resolver();
        if (settings?.dnsServer) {
            try {
                resolver.setServers([settings.dnsServer]);
                log(`Configured Custom DNS: ${settings.dnsServer}`);
            } catch (e) { console.error("Failed to set DNS server", e); }
        }

        log(`Target Range: ${subnet}`);
        nmap.nmapLocation = "nmap";

        // Quick scan for online devices
        const quickScan = new nmap.QuickScan(subnet);

        quickScan.on('complete', async (data: any[]) => {
            const duration = (Date.now() - startTime) / 1000;
            log(`Scan completed in ${duration}s`);
            log(`Found ${data.length} active devices`);

            const foundMacs = data.map((d: any) => d.mac).filter((m: any) => m);

            // 0. Include Self (Host) if missing
            // This is critical for Docker host mode or simple local scans
            const interfaces = os.networkInterfaces();
            for (const name of Object.keys(interfaces)) {
                for (const iface of interfaces[name] || []) {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        const localIp = iface.address;
                        // specific check to see if localIp is in subnet
                        // Simple check: compare first 3 octets for /24
                        // Better: just check if it's already in 'data'
                        const exists = data.find((d: any) => d.ip === localIp);
                        if (!exists) {
                            log(`Adding Host Device: ${localIp}`);
                            data.push({
                                ip: localIp,
                                mac: iface.mac, // might be 00:00:00:00:00:00 in some containers, but try
                                hostname: os.hostname(),
                                vendor: 'Self (Lantern Host)',
                                openPorts: [], // We can't easily scan self with nmap from self, often blocked/confusing. 
                                // But we could run `netstat` or just list it as online.
                                osNmap: os.type() + ' ' + os.release() // Use local OS info
                            });
                        }
                    }
                }
            }

            // 1. Parallelize Network Lookups (NetBIOS & DNS)
            log('Resolving hostnames (DNS & NetBIOS)...');
            const enrichedHosts = await Promise.all(data.map(async (host) => {
                if (!host.mac) return { ...host, finalName: null, type: 'unknown' };

                let finalName = host.hostname;

                // DNS
                if (!finalName || finalName === host.ip) {
                    try {
                        const names = await new Promise<string[]>((resolve, reject) => {
                            resolver.reverse(host.ip, (err, names) => {
                                if (err) resolve([]);
                                else resolve(names);
                            });
                        });
                        if (names && names.length > 0) finalName = names[0];
                    } catch (e) { /* ignore */ }
                }

                // NetBIOS
                if (!finalName || finalName === host.ip || finalName.startsWith('ip-')) {
                    const netbios = await getNetbiosName(host.ip);
                    if (netbios) finalName = netbios;
                }

                const type = guessType(host.vendor, '');
                return { ...host, finalName, type };
            }));

            // 2. Sequential DB Updates
            let newDevicesCount = 0;
            for (const host of enrichedHosts) {
                if (!host.mac) continue;

                const finalName = host.finalName;
                const type = host.type;

                const existing = await prisma.device.findUnique({ where: { mac: host.mac } });

                if (existing) {
                    await prisma.device.update({
                        where: { mac: host.mac },
                        data: {
                            ip: host.ip,
                            status: 'online',
                            lastSeen: new Date(),
                            vendor: host.vendor || existing.vendor,
                            name: (existing.name && existing.name !== 'New Device' && existing.name !== existing.ip) ? existing.name : (finalName || existing.name),
                            type: (existing.type && existing.type !== 'unknown') ? existing.type : type
                        }
                    });

                    // Log History (Online)
                    await prisma.deviceHistory.create({
                        data: {
                            deviceId: existing.id,
                            status: 'online',
                            latency: 0
                        }
                    });

                    if (existing.status === 'offline') {
                        await prisma.event.create({
                            data: {
                                type: 'online',
                                message: `Device ${existing.name || host.ip} coming online`,
                                deviceId: existing.id
                            }
                        });
                    }
                } else {
                    newDevicesCount++;
                    const newDevice = await prisma.device.create({
                        data: {
                            mac: host.mac,
                            ip: host.ip,
                            vendor: host.vendor,
                            name: finalName || 'New Device',
                            status: 'online',
                            type: type
                        }
                    });
                    await prisma.event.create({
                        data: {
                            type: 'new_device',
                            message: `New Device found: ${newDevice.ip} (${newDevice.mac})`,
                            deviceId: newDevice.id
                        }
                    });

                    // Trigger deep scan for new device
                    log(`Queuing deep scan for new device: ${newDevice.ip}`);
                    scanDeviceDetails(newDevice).catch(e => console.error(e));

                    // Log History (New Device Online)
                    await prisma.deviceHistory.create({
                        data: {
                            deviceId: newDevice.id,
                            status: 'online'
                        }
                    });
                }
            }

            if (newDevicesCount > 0) log(`Registered ${newDevicesCount} new devices`);

            // Handle offline devices
            // Handle offline devices (ALL devices not found in this scan)
            const offlineDevices = await prisma.device.findMany({
                where: {
                    mac: { notIn: foundMacs }
                }
            });

            if (offlineDevices.length > 0) {
                // log(`Processing ${offlineDevices.length} offline devices`);
                for (const device of offlineDevices) {

                    // Log History (Offline)
                    await prisma.deviceHistory.create({
                        data: {
                            deviceId: device.id,
                            status: 'offline'
                        }
                    });

                    // Only update DB/Event if it was previously online
                    if (device.status === 'online') {
                        log(`Device went offline: ${device.name || device.ip}`);
                        await prisma.device.update({
                            where: { id: device.id },
                            data: { status: 'offline' }
                        });
                        await prisma.event.create({
                            data: {
                                type: 'offline',
                                message: `Device ${device.name || device.ip} went offline`,
                                deviceId: device.id
                            }
                        });
                    }
                }
            }

            // Update Last Scan Time
            try {
                await prisma.settings.update({
                    where: { id: 'default' },
                    data: { lastScan: new Date() }
                });
            } catch (e) {
                await prisma.settings.upsert({
                    where: { id: 'default' },
                    update: { lastScan: new Date() },
                    create: { id: 'default', lastScan: new Date() }
                });
            }

            log('Scan Complete.');
            // Keep "isScanning" true for just a moment longer so frontend sees "Complete"
            setTimeout(() => { isScanning = false; }, 2000);

            const nextScan = settings?.scanInterval || 5;
            console.log(`Next Scan in ${nextScan} min`);
        });

        quickScan.on('error', (error: any) => {
            log(`Scan Error: ${error}`);
            console.log("Scan error:", error);
            isScanning = false;
        });

        quickScan.startScan();
    } catch (err) {
        log(`Fatal Error: ${err}`);
        isScanning = false;
    }
}

// OS Detection Scan (targeted)
export async function scanDeviceDetails(deviceInput: { ip: string, os?: string | null }) {
    // Check if we already have details to avoid spamming
    if (deviceInput.os && deviceInput.os.length > 0) return;
    const ip = deviceInput.ip;

    // log(`Starting Deep Scan for ${ip}...`); // Optional: might spam main log

    // Nmap OS detection requires root, Docker usually runs as root so it should work.
    // We use the -O flag implicitly via OsAndPortScan or custom arguments
    // node-nmap OsAndPortScan implies -O
    const osScan = new nmap.OsAndPortScan(ip);

    osScan.on('complete', async (data: any[]) => {
        if (data && data.length > 0) {
            const result = data[0];
            // Update device details
            const device = await prisma.device.findFirst({ where: { ip: ip } });
            if (device) {
                const guessedType = guessType(device.vendor || undefined, result.osNmap);

                await prisma.device.update({
                    where: { id: device.id },
                    data: {
                        os: result.osNmap,
                        details: JSON.stringify(result),
                        type: (device.type === 'unknown' || device.type === 'new_device') ? guessedType : device.type
                    }
                });

                // Update Ports
                await prisma.port.deleteMany({ where: { deviceId: device.id } });
                if (result.openPorts) {
                    for (const p of result.openPorts) {
                        await prisma.port.create({
                            data: {
                                port: p.port,
                                protocol: p.protocol,
                                service: p.service,
                                state: 'open',
                                deviceId: device.id
                            }
                        });
                    }
                }
            }
        }
    });

    osScan.on('error', (err: any) => console.error(`Deep scan error for ${ip}:`, err));
    osScan.startScan();
}
