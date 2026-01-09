import { useState, useEffect } from 'react';
import axios from 'axios';
import { Laptop, Server, Smartphone, Router, Shield, Radio, Tv, Circle, Settings as SettingsIcon, X, Moon, Sun, Search, Printer, Watch, ArrowUpDown, Play, Filter } from 'lucide-react';
import { format } from 'date-fns';

import { Device, Settings, SpeedTestResult } from './types';
import { IconMap } from './iconMap';
import { DeviceDrawer } from './components/DeviceDrawer';
import { SpeedTestDashboard } from './components/SpeedTestDashboard';

function App() {
    const [devices, setDevices] = useState<Device[]>([]);
    const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settings, setSettings] = useState<Settings>({ scanInterval: 5, scanDuration: 60, ipRange: '', dnsServer: '8.8.8.8', speedTestIntervalMinutes: 60 });
    const [settingsTab, setSettingsTab] = useState<'scanner' | 'speedtest'>('scanner');

    // View State
    const [view, setView] = useState<'scanner' | 'speedtest'>('scanner');


    // UI State
    const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline' | 'new'>('all');
    const [sortConfig, setSortConfig] = useState<{ key: keyof Device, direction: 'asc' | 'desc' } | null>(null);

    // Speed Test State
    const [speedHistory, setSpeedHistory] = useState<SpeedTestResult[]>([]);
    const [speedStats, setSpeedStats] = useState<any>(null);
    const [isSpeedTesting, setIsSpeedTesting] = useState(false);

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
        } catch (e) { console.error("Failed to fetch devices", e); }
    };

    const fetchSettings = async () => {
        try {
            const res = await axios.get('/api/settings');
            if (res.data) setSettings(res.data);
        } catch (e) {
            // ignore if no settings yet
        }
    };

    const fetchSpeedData = async () => {
        try {
            const [hist, sts] = await Promise.all([
                axios.get('/api/speedtest/history?limit=24'),
                axios.get('/api/speedtest/stats')
            ]);
            setSpeedHistory(hist.data);
            setSpeedStats(sts.data);
        } catch (e) { console.error("Failed to fetch speed data", e); }
    };

    const runSpeedTest = async () => {
        setIsSpeedTesting(true);
        try {
            await axios.post('/api/speedtest/run');
            await fetchSpeedData();
        } catch (e) {
            alert('Speed test failed. check logs.');
            console.error(e);
        } finally {
            setIsSpeedTesting(false);
        }
    };

    useEffect(() => {
        fetchDevices();
        fetchSettings();
        fetchSpeedData();
        const interval = setInterval(() => {
            fetchDevices();
            // Optionally poll speed stats less frequently?
        }, 10000); // Poll every 10s
        return () => clearInterval(interval);
    }, []); // eslint-disable-line

    // Refetch speed data when view changes to speedtest
    useEffect(() => {
        if (view === 'speedtest') {
            fetchSpeedData();
        }
    }, [view]);

    useEffect(() => {
        if (!selectedDevice) {
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

    const getIcon = (type: string, vendor: string = '', customIcon?: string) => {
        if (customIcon) {
            const IconComponent = (IconMap as any)[customIcon];
            if (IconComponent) return <IconComponent size={20} />;
        }
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

    const isNewDevice = (device: Device) => {
        if (!settings.lastScan || !device.createdAt) return false;
        // Logic: If CreatedAt is close to LastSeen (within 2 mins) AND LastSeen is recent
        return new Date(device.createdAt).getTime() > (new Date(settings.lastScan).getTime() - (settings.scanDuration * 1000) - 30000);
    };

    const onlineCount = devices.filter(d => d.status === 'online').length;

    // Filter and Sort
    const filteredDevices = devices.filter(d => {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = (
            d.name?.toLowerCase().includes(searchLower) ||
            d.ip.includes(searchTerm) ||
            d.vendor?.toLowerCase().includes(searchLower) ||
            d.mac?.toLowerCase().includes(searchLower)
        );

        if (!matchesSearch) return false;

        if (filterStatus === 'online') return d.status === 'online';
        if (filterStatus === 'offline') return d.status !== 'online';
        if (filterStatus === 'new') return isNewDevice(d);

        return true;
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
        <div className="h-screen w-full bg-background text-foreground flex flex-col md:flex-row font-sans overflow-hidden">
            <div className="flex-1 flex flex-col min-w-0 h-full p-6 md:p-8 gap-6">

                {/* Fixed Top Section */}
                <div className="flex-none space-y-6">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-3">
                                <div className="bg-primary text-primary-foreground p-2 rounded-lg shadow-lg shadow-primary/20">
                                    <Radio size={24} />
                                </div>
                                <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-teal-400 bg-clip-text text-transparent hidden md:block">Lantern</h1>
                            </div>

                            {/* Navigation Menu */}
                            <nav className="flex items-center gap-1 bg-muted p-1 rounded-lg">
                                <button
                                    onClick={() => setView('scanner')}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'scanner' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    Network Scanner
                                </button>
                                <button
                                    onClick={() => setView('speedtest')}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'speedtest' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    Speed Monitor
                                </button>
                            </nav>
                        </div>

                        <div className="flex gap-2">
                            {view === 'scanner' && (
                                <button onClick={triggerScan} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition-opacity font-medium text-sm">
                                    <Play size={16} /> Scan Network
                                </button>
                            )}
                            {view === 'speedtest' && (
                                <button
                                    onClick={runSpeedTest}
                                    disabled={isSpeedTesting}
                                    className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition-opacity font-medium text-sm disabled:opacity-50"
                                >
                                    {isSpeedTesting ? <span className="animate-spin">⟳</span> : <Play size={16} />}
                                    {isSpeedTesting ? 'Testing...' : 'Run Speed Test'}
                                </button>
                            )}
                            <button onClick={() => setDarkMode(!darkMode)} className="p-2 border rounded-md hover:bg-accent transition-colors">
                                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                            </button>
                            <button onClick={() => setIsSettingsOpen(true)} className="p-2 border rounded-md hover:bg-accent transition-colors">
                                <SettingsIcon size={20} />
                            </button>
                        </div>
                    </div>

                    {view === 'scanner' ? (
                        <>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <Card title="Total Devices" value={devices.length.toString()} />
                                <Card title="Online" value={onlineCount.toString()} className="text-green-600" />
                                <Card title="Offline" value={(devices.length - onlineCount).toString()} />
                                <Card title="Status" value={scanState.isScanning ? 'Scanning...' : 'Idle'} subtitle={settings.lastScan ? `Last: ${format(new Date(settings.lastScan), 'HH:mm:ss dd/MM')}` : undefined} />
                            </div>

                            <div className="flex gap-4">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                    <input
                                        type="text"
                                        placeholder="Search by Name, IP, Vendor or MAC..."
                                        className="w-full pl-9 pr-4 py-2 bg-card border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary h-10"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <div className="relative w-[180px]">
                                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                    <select
                                        className="w-full pl-9 pr-4 py-2 bg-card border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer h-10"
                                        value={filterStatus}
                                        onChange={(e) => setFilterStatus(e.target.value as any)}
                                    >
                                        <option value="all">All Devices</option>
                                        <option value="online">Online Only</option>
                                        <option value="offline">Offline Only</option>
                                        <option value="new">New Devices</option>
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                                        <ArrowUpDown size={12} />
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : null}

                    {/* Live Scan Terminal */}
                    {view === 'scanner' && scanState.isScanning && (
                        <div className="bg-black text-green-500 font-mono text-xs p-4 rounded-lg shadow-lg border border-green-900 overflow-hidden">
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
                </div>

                {/* Flexible/Scrollable Table Section */}
                <div className="flex-1 min-h-0 bg-card border rounded-lg shadow-sm overflow-hidden flex flex-col">
                    {view === 'scanner' ? (
                        <div className="flex-1 overflow-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur supports-[backdrop-filter]:bg-muted/60 border-b shadow-sm">
                                    <tr>
                                        <th className="p-4 font-medium w-16">Type</th>
                                        <th className="p-4 font-medium w-24 cursor-pointer hover:text-foreground" onClick={() => handleSort('status')}>Status <ArrowUpDown className="inline w-3 h-3 ml-1" /></th>
                                        <th className="p-4 font-medium cursor-pointer hover:text-foreground" onClick={() => handleSort('name')}>Name <ArrowUpDown className="inline w-3 h-3 ml-1" /></th>
                                        <th className="p-4 font-medium cursor-pointer hover:text-foreground" onClick={() => handleSort('ip')}>IP Address <ArrowUpDown className="inline w-3 h-3 ml-1" /></th>
                                        <th className="p-4 font-medium">MAC Address</th>
                                        <th className="p-4 font-medium cursor-pointer hover:text-foreground" onClick={() => handleSort('vendor')}>Vendor <ArrowUpDown className="inline w-3 h-3 ml-1" /></th>
                                        <th className="p-4 font-medium cursor-pointer hover:text-foreground" onClick={() => handleSort('lastSeen')}>Last Seen <ArrowUpDown className="inline w-3 h-3 ml-1" /></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {filteredDevices.map(device => {
                                        const isNew = isNewDevice(device);

                                        return (
                                            <tr
                                                key={device.id}
                                                onClick={() => setSelectedDevice(device)}
                                                className={`last:border-0 hover:bg-muted/50 cursor-pointer transition-all 
                                                    ${selectedDevice?.id === device.id ? 'bg-muted/50' : ''}
                                                    ${isNew ? 'shadow-[inset_0_0_20px_rgba(45,212,191,0.15)] bg-teal-500/5' : ''}
                                                `}
                                            >
                                                <td className="p-4 text-muted-foreground w-16">
                                                    <div className="relative">
                                                        {getIcon(device.type, device.vendor, device.customIcon)}
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
                                                <td className="p-4 font-medium text-foreground">{device.customName || device.name || 'Unknown'}</td>
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
                                                No devices found.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-auto p-6">
                            <SpeedTestDashboard
                                history={speedHistory}
                                stats={speedStats}
                                settings={settings}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Detail View Drawer */}
            {selectedDevice && (
                <DeviceDrawer
                    device={selectedDevice}
                    onClose={() => setSelectedDevice(null)}
                    onUpdate={(updated) => {
                        setDevices(prev => prev.map(d => d.id === updated.id ? updated : d));
                        setSelectedDevice(updated);
                    }}
                />
            )}

            {/* Settings Dialog */}
            {isSettingsOpen && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                    <div className="bg-background p-6 rounded-lg w-full max-w-md shadow-2xl border">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold">Settings</h2>
                            <button onClick={() => setIsSettingsOpen(false)}><X size={20} /></button>
                        </div>

                        <div className="flex border-b mb-6">
                            <button
                                className={`flex-1 pb-2 text-sm font-medium transition-colors ${settingsTab === 'scanner' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => setSettingsTab('scanner')}
                            >
                                Network Scanner
                            </button>
                            <button
                                className={`flex-1 pb-2 text-sm font-medium transition-colors ${settingsTab === 'speedtest' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => setSettingsTab('speedtest')}
                            >
                                Speed Monitor
                            </button>
                        </div>

                        <div className="space-y-4">
                            {settingsTab === 'scanner' ? (
                                <>
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
                                </>
                            ) : (
                                <>
                                    <div>
                                        <label className="text-sm font-medium mb-1 block">Automated Test Interval (min)</label>
                                        <input
                                            type="number"
                                            className="w-full p-2 border rounded bg-background"
                                            value={settings.speedTestIntervalMinutes || 60}
                                            onChange={e => setSettings({ ...settings, speedTestIntervalMinutes: parseInt(e.target.value) })}
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">Set to 0 to disable automatic testing.</p>
                                    </div>
                                </>
                            )}
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

function Card({ title, value, className, subtitle }: { title: string, value: string, className?: string, subtitle?: string }) {
    return (
        <div className="p-4 rounded-lg border bg-card text-card-foreground shadow-sm">
            <h3 className="text-xs font-medium text-muted-foreground tracking-wide uppercase">{title}</h3>
            <div className={`text-2xl font-bold mt-1 ${className}`}>{value}</div>
            {subtitle && <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>}
        </div>
    )
}

export default App;
