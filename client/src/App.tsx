import { useState, useEffect } from 'react';
import axios from 'axios';
import { Laptop, Server, Smartphone, Router, Shield, Radio, Tv, Circle, Play, Settings as SettingsIcon, X, Moon, Sun, Search, Printer, Watch, ArrowUpDown } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format } from 'date-fns';

interface Device {
    id: string;
    mac: string;
    ip: string;
    name?: string;
    vendor?: string;
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
}

interface DeviceHistory {
    id: string;
    status: string;
    timestamp: string;
    latency?: number;
}

interface Event {
    id: string;
    type: string;
    message: string;
    timestamp: string;
}

interface Settings {
    scanInterval: number;
    scanDuration: number;
    ipRange: string;
    dnsServer: string;
    lastScan?: string;
}

function App() {
    const [devices, setDevices] = useState<Device[]>([]);
    const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settings, setSettings] = useState<Settings>({ scanInterval: 5, scanDuration: 60, ipRange: '', dnsServer: '8.8.8.8' });
    const [actionOutput, setActionOutput] = useState<string | null>(null);

    // UI State
    const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof Device, direction: 'asc' | 'desc' } | null>(null);

    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [darkMode]);

    const fetchDevices = async () => {
        try {
            const res = await axios.get('/api/devices');
            setDevices(res.data);
            // Update selected device if open
            if (selectedDevice) {
                const updated = res.data.find((d: Device) => d.id === selectedDevice.id);
                if (updated) {
                    // Fetch details to get events
                    const detailRes = await axios.get(`/api/devices/${selectedDevice.id}`);
                    setSelectedDevice(detailRes.data);
                }
            }
        } catch (err) {
            console.error(err);
        }
    };

    const fetchSettings = async () => {
        try {
            const res = await axios.get('/api/settings');
            setSettings(res.data);
        } catch (err) { console.error(err); }
    }

    useEffect(() => {
        fetchDevices();
        fetchSettings();
        const interval = setInterval(fetchDevices, 10000); // Poll every 10s
        return () => clearInterval(interval);
    }, []); // eslint-disable-line

    useEffect(() => {
        if (!selectedDevice) {
            setActionOutput(null);
            return;
        }

        // Fetch full details (history, events) if not present
        if (!selectedDevice.history) {
            axios.get(`/api/devices/${selectedDevice.id}`)
                .then(res => {
                    setSelectedDevice(prev => (!prev || prev.id !== res.data.id ? prev : { ...prev, ...res.data }));
                })
                .catch(err => console.error(err));
        }
    }, [selectedDevice?.id]);


    const saveSettings = async () => {
        await axios.put('/api/settings', settings);
        setIsSettingsOpen(false);
    };

    const clearDevices = async () => {
        if (confirm('Are you sure you want to clear all devices? This cannot be undone.')) {
            await axios.delete('/api/devices');
            setDevices([]);
            setIsSettingsOpen(false);
        }
    };

    // State for scan progress
    const [scanState, setScanState] = useState({ isScanning: false, logs: [] as string[] });

    useEffect(() => {
        let pollInterval: any;
        if (scanState.isScanning) {
            pollInterval = setInterval(async () => {
                try {
                    const res = await axios.get('/api/devices/status');
                    setScanState(res.data);
                    if (res.data.isScanning) {
                        // scanning
                    } else {
                        fetchDevices(); // Refresh when done
                    }
                } catch (e) { console.error(e); }
            }, 1000); // 1s polling for live feel
        }
        return () => clearInterval(pollInterval);
    }, [scanState.isScanning]);

    const triggerScan = async () => {
        await axios.post('/api/devices/scan');
        setScanState(prev => ({ ...prev, isScanning: true })); // Optimistic update
    };

    const getIcon = (type: string, vendor: string = '') => {
        const t = (type || '').toLowerCase();
        const v = (vendor || '').toLowerCase();

        if (t.includes('laptop') || v.includes('macbook')) return <Laptop size={20} />;
        if (t.includes('server') || v.includes('synology') || v.includes('qnap')) return <Server size={20} />;
        if (t.includes('phone') || t.includes('mobile') || t.includes('iphone') || t.includes('android')) return <Smartphone size={20} />;
        if (t.includes('router') || t.includes('gateway') || v.includes('ubiquiti')) return <Router size={20} />;
        if (t.includes('security') || t.includes('camera') || t.includes('nvr') || t.includes('dvr')) return <Shield size={20} />;
        if (t.includes('iot') || v.includes('hue') || v.includes('nest') || v.includes('google home')) return <Radio size={20} />;
        if (t.includes('tv') || t.includes('television') || v.includes('bravia') || v.includes('lg webos')) return <Tv size={20} />;
        if (t.includes('printer') || v.includes('epson') || v.includes('hp') || v.includes('canon')) return <Printer size={20} />;
        if (t.includes('watch') || v.includes('apple watch')) return <Watch size={20} />;

        return <Circle size={20} className="opacity-50" />;
    };

    const onlineCount = devices.filter(d => d.status === 'online').length;

    // Filter and Sort
    const filteredDevices = devices.filter(d => {
        const searchLower = searchTerm.toLowerCase();
        return (
            d.name?.toLowerCase().includes(searchLower) ||
            d.ip.includes(searchTerm) ||
            d.vendor?.toLowerCase().includes(searchLower) ||
            d.mac?.toLowerCase().includes(searchLower)
        );
    }).sort((a, b) => {
        if (!sortConfig) return 0;
        const aValue = a[sortConfig.key] || '';
        const bValue = b[sortConfig.key] || '';

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    const handleSort = (key: keyof Device) => {
        setSortConfig(current => ({
            key,
            direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    return (
        <div className="min-h-screen bg-background text-foreground p-8 flex flex-col md:flex-row gap-6 font-sans">
            <div className="flex-1">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="bg-primary text-primary-foreground p-2 rounded-lg shadow-lg shadow-primary/20">
                            <Radio size={24} />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-teal-400 bg-clip-text text-transparent">Lantern</h1>
                    </div>

                    <div className="flex gap-2">
                        <button onClick={triggerScan} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition-opacity font-medium text-sm">
                            <Play size={16} /> Scan Network
                        </button>
                        <button onClick={() => setDarkMode(!darkMode)} className="p-2 border rounded-md hover:bg-accent transition-colors">
                            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                        </button>
                        <button onClick={() => setIsSettingsOpen(true)} className="p-2 border rounded-md hover:bg-accent transition-colors">
                            <SettingsIcon size={20} />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <Card title="Total Devices" value={devices.length.toString()} />
                    <Card title="Online" value={onlineCount.toString()} className="text-green-600" />
                    <Card title="Offline" value={(devices.length - onlineCount).toString()} />
                    <Card title="Status" value={scanState.isScanning ? 'Scanning...' : 'Idle'} subtitle={settings.lastScan ? `Last: ${format(new Date(settings.lastScan), 'HH:mm:ss dd/MM')}` : undefined} />
                </div>

                <div className="mb-6">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search by Name, IP, Vendor or MAC..."
                            className="w-full pl-9 pr-4 py-2 bg-card border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Live Scan Terminal */}
                {scanState.isScanning && (
                    <div className="bg-black text-green-500 font-mono text-xs p-4 rounded-lg mb-6 shadow-lg border border-green-900 overflow-hidden">
                        <div className="flex justify-between items-center border-b border-green-900 pb-2 mb-2">
                            <span className="font-bold flex items-center gap-2"><span className="animate-pulse">●</span> LIVE SCAN TERMINAL</span>
                            <span className="opacity-50 text-[10px]">{settings.ipRange || 'Default Subnet'}</span>
                        </div>
                        <div className="h-32 overflow-y-auto flex flex-col-reverse">
                            {/* Reverse log order to show new at top/bottom depending on preference, actually flex-col-reverse keeps bottom anchored */}
                            <div>
                                {scanState.logs.map((log, i) => (
                                    <div key={i} className="whitespace-nowrap">{log}</div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                <div className="bg-card border rounded-lg overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b bg-muted/40">
                                    <th className="p-4 font-medium w-16">Type</th>
                                    <th className="p-4 font-medium w-24 cursor-pointer hover:text-foreground" onClick={() => handleSort('status')}>Status <ArrowUpDown className="inline w-3 h-3 ml-1" /></th>
                                    <th className="p-4 font-medium cursor-pointer hover:text-foreground" onClick={() => handleSort('name')}>Name <ArrowUpDown className="inline w-3 h-3 ml-1" /></th>
                                    <th className="p-4 font-medium cursor-pointer hover:text-foreground" onClick={() => handleSort('ip')}>IP Address <ArrowUpDown className="inline w-3 h-3 ml-1" /></th>
                                    <th className="p-4 font-medium">MAC Address</th>
                                    <th className="p-4 font-medium cursor-pointer hover:text-foreground" onClick={() => handleSort('vendor')}>Vendor <ArrowUpDown className="inline w-3 h-3 ml-1" /></th>
                                    <th className="p-4 font-medium cursor-pointer hover:text-foreground" onClick={() => handleSort('lastSeen')}>Last Seen <ArrowUpDown className="inline w-3 h-3 ml-1" /></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredDevices.map(device => {
                                    // Check if new: created within last scan duration + buffer relative to last scan time
                                    // If lastScan is brand new (app start), everything might look new, so we rely on backend timestamps.
                                    // Logic: If CreatedAt is close to LastSeen (within 2 mins) AND LastSeen is recent (within 5 mins of now)
                                    // Actually simpler: If CreatedAt > (Now - 5 mins)
                                    // User requirement: "from the last scan".
                                    const isNew = settings.lastScan && device.createdAt &&
                                        new Date(device.createdAt).getTime() > (new Date(settings.lastScan).getTime() - (settings.scanDuration * 1000) - 30000);

                                    return (
                                        <tr
                                            key={device.id}
                                            onClick={() => setSelectedDevice(device)}
                                            className={`border-b last:border-0 hover:bg-muted/50 cursor-pointer transition-all 
                                                ${selectedDevice?.id === device.id ? 'bg-muted/50' : ''}
                                                ${isNew ? 'shadow-[inset_0_0_20px_rgba(45,212,191,0.15)] bg-teal-500/5' : ''}
                                            `}
                                        >
                                            <td className="p-4 text-muted-foreground w-16">
                                                <div className="relative">
                                                    {getIcon(device.type, device.vendor)}
                                                    {isNew && <span className="absolute -top-1 -right-1 w-2 h-2 bg-teal-400 rounded-full animate-pulse shadow-lg shadow-teal-400" />}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${device.status === 'online'
                                                    ? 'bg-green-500/10 text-green-600 border-green-500/20'
                                                    : 'bg-muted text-muted-foreground border-border'
                                                    }`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${device.status === 'online' ? 'bg-green-500' : 'bg-gray-400'}`} />
                                                    {device.status}
                                                </span>
                                            </td>
                                            <td className="p-4 font-medium text-foreground">{device.name || 'Unknown'}</td>
                                            <td className="p-4 font-mono text-muted-foreground">{device.ip}</td>
                                            <td className="p-4 font-mono text-xs text-muted-foreground">{device.mac}</td>
                                            <td className="p-4 text-muted-foreground">{device.vendor || '-'}</td>
                                            <td className="p-4 text-muted-foreground whitespace-nowrap text-xs">{format(new Date(device.lastSeen), 'MMM d, HH:mm')}</td>
                                        </tr>
                                    );
                                })}
                                {filteredDevices.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="p-12 text-center text-muted-foreground">
                                            No devices found. Run a scan to populate the list.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Detail View Drawer */}
            {selectedDevice && (
                <div className="w-full md:w-[400px] bg-card border-l md:border-l border-t md:border-t-0 p-6 shadow-xl fixed md:relative bottom-0 right-0 h-[60vh] md:h-auto overflow-y-auto z-10 flex flex-col">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h2 className="text-xl font-bold">{selectedDevice.name || selectedDevice.ip}</h2>
                            <div className="text-sm text-muted-foreground mt-1">Device Details</div>
                        </div>
                        <button onClick={() => setSelectedDevice(null)} className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="space-y-6 flex-1 overflow-y-auto pr-2">
                        <div className="grid grid-cols-2 gap-4">
                            <DetailItem label="Status" value={selectedDevice.status}
                                badge={selectedDevice.status === 'online' ? 'green' : 'gray'} />
                            <DetailItem label="Type" value={selectedDevice.type} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <DetailItem label="IP Address" value={selectedDevice.ip} mono />
                            <DetailItem label="MAC Address" value={selectedDevice.mac} mono />
                        </div>

                        <DetailItem label="Vendor" value={selectedDevice.vendor || 'Unknown'} />

                        <div className="grid grid-cols-2 gap-4">
                            <DetailItem label="First Seen" value={selectedDevice.createdAt ? format(new Date(selectedDevice.createdAt), 'MMM d, HH:mm') : '-'} />
                            <DetailItem label="Last Seen" value={format(new Date(selectedDevice.lastSeen), 'MMM d, HH:mm')} />
                        </div>

                        <div>
                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">OS / Nmap Details</div>
                            <div className="text-xs bg-muted p-3 rounded-md font-mono whitespace-pre-wrap">
                                {selectedDevice.details ? selectedDevice.details : (selectedDevice.os || 'No detailed scan data')}
                            </div>
                        </div>

                        {/* Uptime Graph */}
                        {selectedDevice.history && selectedDevice.history.length > 0 && (
                            <div className="border-t pt-6 h-48">
                                <h3 className="font-semibold text-sm mb-4">Uptime History</h3>
                                <div className="h-full w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={selectedDevice.history.map(h => ({
                                            time: new Date(h.timestamp).getTime(),
                                            displayTime: format(new Date(h.timestamp), 'HH:mm'),
                                            status: h.status === 'online' ? 1 : 0
                                        }))}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                                            <XAxis
                                                dataKey="displayTime"
                                                stroke="#888"
                                                fontSize={10}
                                                tickLine={false}
                                                interval="preserveStartEnd"
                                            />
                                            <YAxis
                                                hide
                                                domain={[0, 1]}
                                            />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#000', border: '1px solid #333' }}
                                                labelStyle={{ color: '#888' }}
                                                formatter={(value) => [value === 1 ? 'Online' : 'Offline', 'Status']}
                                            />
                                            <Line
                                                type="stepAfter"
                                                dataKey="status"
                                                stroke="#10b981"
                                                strokeWidth={2}
                                                dot={false}
                                                activeDot={{ r: 4, fill: '#10b981' }}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}

                        {selectedDevice.latency && (
                            <div className="grid grid-cols-2 gap-4">
                                <DetailItem label="Latency" value={`${selectedDevice.latency} ms`} />
                                <DetailItem label="Jitter" value={`${selectedDevice.jitter || 0} ms`} />
                            </div>
                        )}

                        {/* Actions */}
                        <div className="border-t pt-6 space-y-3">
                            <h3 className="font-semibold text-sm">Quick Actions</h3>
                            <div className="grid grid-cols-3 gap-2">
                                <DeviceAction deviceId={selectedDevice.id} type="ping" label="Ping" onOutput={setActionOutput} />
                                <DeviceAction deviceId={selectedDevice.id} type="portscan" label="Port Scan" onOutput={setActionOutput} />
                                <DeviceAction deviceId={selectedDevice.id} type="wol" label="WOL" onOutput={setActionOutput} />
                            </div>
                        </div>

                        {/* Console Output */}
                        {actionOutput && (
                            <div className="border-t pt-6">
                                <h3 className="font-semibold text-sm mb-2">Console Output</h3>
                                <div className="bg-black text-green-400 p-3 rounded-md font-mono text-xs whitespace-pre-wrap overflow-x-auto">
                                    {actionOutput}
                                </div>
                            </div>
                        )}

                        {/* Timeline */}
                        <div className="border-t pt-6">
                            <h3 className="font-semibold text-sm mb-4">Event Timeline</h3>
                            <div className="space-y-4 relative pl-4 border-l-2 border-muted ml-2">
                                {selectedDevice.events && selectedDevice.events.length > 0 ? selectedDevice.events.map(e => (
                                    <div key={e.id} className="relative">
                                        <div className={`absolute -left-[21px] top-1 w-3 h-3 rounded-full border-2 border-background ${e.type === 'online' ? 'bg-green-500' : 'bg-gray-400'}`} />
                                        <div className="text-xs font-mono text-muted-foreground">{format(new Date(e.timestamp), 'MMM d, HH:mm:ss')}</div>
                                        <div className="text-sm">{e.message}</div>
                                    </div>
                                )) : (
                                    <div className="text-xs text-muted-foreground">No recorded events</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Settings Dialog */}
            {isSettingsOpen && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                    <div className="bg-background p-6 rounded-lg w-full max-w-md shadow-2xl border">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold">Settings</h2>
                            <button onClick={() => setIsSettingsOpen(false)}><X size={20} /></button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium mb-1 block">IP Range (CIDR)</label>
                                <input
                                    className="w-full p-2 border rounded bg-background"
                                    value={settings.ipRange || ''}
                                    placeholder="e.g., 192.168.1.0/24"
                                    onChange={e => setSettings({ ...settings, ipRange: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">Scan Interval (min)</label>
                                <input
                                    type="number"
                                    className="w-full p-2 border rounded bg-background"
                                    value={settings.scanInterval}
                                    onChange={e => setSettings({ ...settings, scanInterval: parseInt(e.target.value) })}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">Scan Timeout (sec)</label>
                                <input
                                    type="number"
                                    className="w-full p-2 border rounded bg-background"
                                    value={settings.scanDuration}
                                    onChange={e => setSettings({ ...settings, scanDuration: parseInt(e.target.value) })}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">DNS Server</label>
                                <input
                                    className="w-full p-2 border rounded bg-background"
                                    value={settings.dnsServer}
                                    onChange={e => setSettings({ ...settings, dnsServer: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="mt-8 pt-4 border-t flex flex-col gap-4">
                            <div className="flex justify-end gap-2">
                                <button onClick={() => setIsSettingsOpen(false)} className="px-4 py-2 hover:bg-accent rounded">Cancel</button>
                                <button onClick={saveSettings} className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90">Save Changes</button>
                            </div>
                            <button onClick={clearDevices} className="w-full px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 border border-red-200 rounded transition-colors text-sm font-medium">
                                Clear All Data
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function DetailItem({ label, value, mono, badge }: { label: string, value: string, mono?: boolean, badge?: 'green' | 'gray' }) {
    return (
        <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
            <div className={`text-sm ${mono ? 'font-mono' : ''} ${badge ? `inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${badge === 'green' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-700 border-gray-200'}` : ''}`}>
                {value}
            </div>
        </div>
    )
}

function ActionButton({ onClick, label, loading }: { onClick: () => void, label: string, loading?: boolean }) {
    return (
        <button
            onClick={onClick}
            disabled={loading}
            className="px-3 py-2 border rounded-md hover:bg-accent text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        >
            {loading ? <span className="animate-spin mr-2">⟳</span> : null}
            {loading ? 'Running...' : label}
        </button>
    )
}

function Card({ title, value, className, subtitle }: { title: string, value: string, className?: string, subtitle?: string }) {
    return (
        <div className="p-4 rounded-lg border bg-card text-card-foreground shadow-sm">
            <h3 className="text-xs font-medium text-muted-foreground tracking-wide uppercase">{title}</h3>
            <div className={`text-2xl font-bold mt-1 ${className}`}>{value}</div>
            {subtitle && <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>}
        </div>
    )
}

function DeviceAction({ deviceId, type, label, onOutput }: { deviceId: string, type: string, label: string, onOutput: (out: string) => void }) {
    const [loading, setLoading] = useState(false);

    const handleAction = async () => {
        setLoading(true);
        onOutput(`> Executing ${label}...\n`); // Immediate feedback
        try {
            const res = await axios.post(`/api/devices/${deviceId}/action`, { type });
            if (res.data.output) {
                onOutput(res.data.output);
            } else if (res.data.message) {
                onOutput(`> ${res.data.message}`);
            } else {
                onOutput(JSON.stringify(res.data, null, 2));
            }
        } catch (err: any) {
            onOutput(`Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    return <ActionButton onClick={handleAction} label={label} loading={loading} />;
}

export default App;
