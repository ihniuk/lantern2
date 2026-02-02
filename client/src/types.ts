export interface Device {
    id: string;
    mac: string;
    ip: string;
    name?: string;
    customName?: string;
    vendor?: string;
    customIcon?: string;
    customVendor?: string;
    customType?: string;
    customOS?: string;
    type: string;
    status: string;
    lastSeen: string;
    createdAt?: string;
    os?: string;
    details?: string;
    events?: Event[];
    latency?: number;
    jitter?: number;
    history?: DeviceHistory[];
    tags?: string[];
}

export interface DeviceHistory {
    id: string;
    status: string;
    timestamp: string;
    latency?: number;
}

export interface Event {
    id: string;
    type: string;
    message: string;
    timestamp: string;
}

export interface Settings {
    scanInterval: number;
    scanDuration: number;
    ipRange: string;
    dnsServer: string;
    lastScan?: string;
    speedTestIntervalMinutes?: number;
    notifyNewDevice?: boolean;
    notifySpeedDrop?: boolean;
    notifyOnline?: boolean;
    notifyOffline?: boolean;

}

export interface SpeedTestResult {
    id: string;
    timestamp: string;
    ping: number;
    jitter: number;
    download: number;
    upload: number;
    packetLoss?: number;
    isp?: string;
    serverLocation?: string;
}
