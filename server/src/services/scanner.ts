import prisma from '../prisma';
import nmap from 'node-nmap';
import { exec } from 'child_process';
import util from 'util';
import os from 'os';
import { notificationService } from './notificationService';

const execPromise = util.promisify(exec);

// Function to get local subnet automatically if not configured
// This is a naive implementation, ideally we parse interface info
// Helper to count bits in netmask
function netmaskToCIDR(netmask: string): number {
    return (netmask.split('.').map(Number)
        .map(part => (part >>> 0).toString(2))
        .join('')
        .match(/1/g) || []).length;
}

// Calculate Network Address from IP and Netmask
function calculateNetworkAddress(ip: string, netmask: string): string {
    const ipParts = ip.split('.').map(Number);
    const maskParts = netmask.split('.').map(Number);
    const networkParts = ipParts.map((part, index) => part & maskParts[index]);
    return networkParts.join('.');
}

async function getLocalSubnet(): Promise<string> {
    const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
    if (settings?.ipRange) {
        log(`Using configured IP Range: ${settings.ipRange}`);
        return settings.ipRange;
    }

    // Auto-detect from Interfaces
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
            // Skip internal (localhost) and non-IPv4
            if (iface.family === 'IPv4' && !iface.internal) {
                // Heuristic: Prefer interfaces that look like typical LANs (192., 10., 172.)
                // But honestly, the first valid external IPv4 is usually the one we want in Host mode.
                const cidr = netmaskToCIDR(iface.netmask);
                const network = calculateNetworkAddress(iface.address, iface.netmask);
                const range = `${network}/${cidr}`;
                log(`Auto-detected Subnet: ${range} (via ${name})`);
                return range;
            }
        }
    }

    log('Could not auto-detect subnet, falling back to default.');
    return '192.168.1.0/24';
}

// Helper to guess type based on vendor/os
function guessType(vendor?: string, os?: string): string {
    const v = (vendor || '').toLowerCase();
    const o = (os || '').toLowerCase();

    // VM Detection High Priority
    if (v.includes('vmware') || v.includes('virtualbox') || v.includes('qemu') || v.includes('parallels')) return 'vm';
    // Hyper-V special case: Microsoft Vendor + Linux OS = VM
    if (v.includes('microsoft') && o.includes('linux')) return 'vm';

    if (v.includes('apple')) return 'mobile'; // Or laptop, hard to say, default to mobile/tablet
    if (v.includes('samsung') || v.includes('motorola') || v.includes('google') || v.includes('xiaomi')) return 'mobile';
    if (v.includes('dell') || v.includes('hp') || v.includes('lenovo')) return 'laptop';
    if (v.includes('philips') || v.includes('hue') || v.includes('nest')) return 'iot';
    if (v.includes('ubiquiti') || v.includes('cisco') || v.includes('tp-link') || v.includes('netgear')) return 'router';
    if (v.includes('raspberry') || v.includes('arduino')) return 'iot';
    if (v.includes('synology') || v.includes('ugreen') || v.includes('qnap')) return 'server';

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

// mDNS Lookup Helper
import mDNS from 'multicast-dns';
import { Client as SsdpClient } from 'node-ssdp';

// ... (keep mDNS helper)

async function batchSsdpLookup(timeoutMs = 3000): Promise<Map<string, string>> {
    const client = new SsdpClient();
    const results = new Map<string, string>();

    return new Promise((resolve) => {
        client.on('response', (headers, statusCode, rinfo) => {
            if (headers.SERVER || headers.USN) {
                // Try to guess a name from SERVER string or USN
                // e.g. "Linux/2.x UPnP/1.0 Avahi/0.6.x" -> maybe just "Avahi"
                // e.g. "Philips-hue-bridge/1.0 UPnP/1.0 IpBridge/1.17.0" -> "Philips-hue-bridge"
                let name = String(headers.SERVER || '');

                // Smart cleanup of common messy server strings
                if (name.includes('Philips-hue-bridge')) name = 'Philips Hue Bridge';
                else if (name.includes('Sonos')) name = 'Sonos Speaker';
                else if (name.toLowerCase().includes('samsung')) name = 'Samsung Device';
                else if (name.includes('UPnP')) {
                    // Try to grab the first useful word
                    name = name.split('/')[0].split(' ')[0];
                }

                if (name && rinfo.address) {
                    results.set(rinfo.address, name);
                }
            }
        });

        client.search('ssdp:all');

        setTimeout(() => {
            client.stop();
            resolve(results);
        }, timeoutMs);
    });
}

function reverseIpToArpa(ip: string): string {
    return ip.split('.').reverse().join('.') + '.in-addr.arpa';
}

async function batchMdnsLookup(ips: string[], timeoutMs = 2000): Promise<Map<string, string>> {
    const mdns = mDNS();
    const results = new Map<string, string>();

    // Prepare questions
    const questions = ips.map(ip => ({
        name: reverseIpToArpa(ip),
        type: 'PTR' as const
    }));

    return new Promise((resolve) => {
        mdns.on('response', (response) => {
            response.answers.forEach(answer => {
                if (answer.type === 'PTR') {
                    // answer.name might be 19.0.0.10.in-addr.arpa
                    const parts = answer.name.replace('.in-addr.arpa', '').split('.').reverse().join('.');
                    if (ips.includes(parts) && typeof answer.data === 'string') {
                        results.set(parts, answer.data);
                    }
                }
            });
            response.additionals.forEach(add => {
                if (add.type === 'A' && typeof add.name === 'string' && typeof add.data === 'string') {
                    if (ips.includes(add.data)) {
                        results.set(add.data, add.name);
                    }
                }
            });
        });

        try {
            mdns.query(questions);
        } catch (e) {
            console.error('mDNS Query Error:', e);
        }

        setTimeout(() => {
            try {
                mdns.destroy();
            } catch (e) { }
            resolve(results);
        }, timeoutMs);
    });
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

            const initialDeviceCount = await prisma.device.count();
            const newDevicesBuffer: string[] = [];

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

            // 1a. Batch mDNS Lookup
            log('Resolving hostnames (mDNS)...');
            const mdnsMap = await batchMdnsLookup(data.map((d: any) => d.ip));
            log(`mDNS resolved ${mdnsMap.size} hosts`);

            // 1b. Batch SSDP Lookup
            log('Resolving hostnames (SSDP)...');
            const ssdpMap = await batchSsdpLookup(3000);
            log(`SSDP resolved ${ssdpMap.size} hosts`);

            // 1c. Parallelize Network Lookups (NetBIOS & DNS)
            log('Resolving hostnames (DNS & NetBIOS)...');
            const enrichedHosts = await Promise.all(data.map(async (host) => {
                if (!host.mac) return { ...host, finalName: null, type: 'unknown' };

                let finalName = host.hostname;

                // mDNS High Priority
                if (mdnsMap.has(host.ip)) {
                    finalName = mdnsMap.get(host.ip);
                }
                // SSDP Fallback (often has better Model Names like "Sonos")
                else if (ssdpMap.has(host.ip)) {
                    finalName = ssdpMap.get(host.ip);
                }

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
                    if (existing.ip !== host.ip) {
                        log(`Device ${existing.name} changed IP: ${existing.ip} -> ${host.ip}`);
                        notificationService.add({
                            type: 'device_status',
                            title: 'IP Address Changed',
                            message: `${existing.name} is now at ${host.ip} (was ${existing.ip}).`,
                            metadata: { deviceId: existing.id, oldIp: existing.ip, newIp: host.ip }
                        });
                    }

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

                    // Logic for Online Notification
                    if (settings?.notifyOnline || (existing.tags && existing.tags.includes('notify-online'))) {
                        if (existing.status === 'offline') {
                            notificationService.add({
                                type: 'device_status',
                                title: 'Device Online',
                                message: `${existing.name} is back online.`,
                                metadata: { deviceId: existing.id }
                            });
                        }
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

                    const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
                    if (settings?.notifyNewDevice) {
                        if (initialDeviceCount === 0) {
                            newDevicesBuffer.push(`${newDevice.name} (${newDevice.ip})`);
                        } else {
                            notificationService.add({
                                type: 'new_device',
                                title: 'New Device Discovered',
                                message: `${newDevice.name} (${newDevice.ip}) joined the network.`,
                                metadata: { deviceId: newDevice.id, ip: newDevice.ip }
                            });
                        }
                    }

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

            if (initialDeviceCount === 0 && newDevicesBuffer.length > 0) {
                notificationService.add({
                    type: 'new_device',
                    title: 'First Scan Completed',
                    message: `Initial scan found ${newDevicesBuffer.length} devices on the network.`,
                    metadata: { type: 'summary', count: newDevicesBuffer.length }
                });
            }

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

                        const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
                        if (settings?.notifyOffline || (device.tags && device.tags.includes('notify-offline'))) {
                            notificationService.add({
                                type: 'device_status',
                                title: 'Device Offline',
                                message: `${device.name} is now offline.`,
                                metadata: { deviceId: device.id }
                            });
                        }
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
