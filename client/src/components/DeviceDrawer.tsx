import { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Radio, Search, Play, Check, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Device } from '../types';
import { IconMap } from '../iconMap';

interface DeviceDrawerProps {
    device: Device;
    onClose: () => void;
    onUpdate: (device: Device) => void;
    uniqueVendors?: string[];
    uniqueTypes?: string[];
    uniqueOS?: string[];
}

export function DeviceDrawer({ device, onClose, onUpdate, uniqueVendors = [], uniqueTypes = [], uniqueOS = [] }: DeviceDrawerProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(device.customName || device.name || '');
    const [editVendor, setEditVendor] = useState(device.customVendor || device.vendor || '');
    const [editType, setEditType] = useState(device.customType || device.type || '');
    const [editOS, setEditOS] = useState(device.customOS || device.os || '');
    const [editIcon, setEditIcon] = useState(device.customIcon || '');
    const [editTags, setEditTags] = useState<string[]>(device.tags || []);
    const [actionOutput, setActionOutput] = useState<string | null>(null);
    const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');
    const [showDetails, setShowDetails] = useState(false);

    // Sync state when device changes
    useEffect(() => {
        setEditName(device.customName || device.name || '');
        setEditVendor(device.customVendor || device.vendor || '');
        setEditType(device.customType || device.type || '');
        setEditOS(device.customOS || device.os || '');
        setEditIcon(device.customIcon || '');
        setEditTags(device.tags || []);
        setActionOutput(null); // Clear output on device switch
    }, [device]);

    const handleSave = async () => {
        try {
            const res = await axios.patch(`/api/devices/${device.id}`, {
                customName: editName,
                customVendor: editVendor,
                customType: editType,
                customOS: editOS,
                customIcon: editIcon,
                tags: editTags
            });
            onUpdate(res.data);
            setIsEditing(false);
        } catch (e) {
            console.error("Failed to update device", e);
        }
    };

    const handleAction = async (type: string, label: string) => {
        setActionOutput(`> Executing ${label}...\n`);
        try {
            const res = await axios.post(`/api/devices/${device.id}/action`, { type });
            if (res.data.output) setActionOutput(res.data.output);
            else if (res.data.message) setActionOutput(`> ${res.data.message}`);
            else setActionOutput(JSON.stringify(res.data, null, 2));
        } catch (e: any) {
            setActionOutput(`Error: ${e.message}`);
        }
    };

    // Helper to parse details JSON safely
    const parseDetails = (jsonDetails: string | null | undefined) => {
        if (!jsonDetails) return null;
        try {
            return JSON.parse(jsonDetails);
        } catch (e) {
            return null;
        }
    };

    const detailsObj = parseDetails(device.details);

    // Prepare clean object for raw view (exclude heavy relations)
    const { events, history, ...cleanDevice } = device as any;

    return (
        <div className="w-full md:w-[400px] bg-card border-l md:border-l border-t md:border-t-0 p-6 shadow-xl fixed md:relative bottom-0 right-0 h-[60vh] md:h-auto overflow-y-auto z-10 flex flex-col">
            <div className="flex justify-between items-start mb-6">
                <div className="flex-1 mr-4">
                    {isEditing ? (
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-semibold text-muted-foreground uppercase">Device Name</label>
                                <input
                                    className="w-full p-2 border rounded bg-background text-foreground mt-1"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    placeholder="Enter custom name"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-semibold text-muted-foreground uppercase">Vendor</label>
                                    <input
                                        className="w-full p-2 border rounded bg-background text-foreground mt-1"
                                        value={editVendor}
                                        onChange={e => setEditVendor(e.target.value)}
                                        placeholder={device.vendor || "Unknown"}
                                        list="vendor-list"
                                    />
                                    <datalist id="vendor-list">
                                        {uniqueVendors.map(v => <option key={v} value={v} />)}
                                    </datalist>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-muted-foreground uppercase">Type</label>
                                    <input
                                        className="w-full p-2 border rounded bg-background text-foreground mt-1"
                                        value={editType}
                                        onChange={e => setEditType(e.target.value)}
                                        placeholder={device.type || "unknown"}
                                        list="type-list"
                                    />
                                    <datalist id="type-list">
                                        {uniqueTypes.map(t => <option key={t} value={t} />)}
                                    </datalist>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-muted-foreground uppercase">OS / Device Model</label>
                                <input
                                    className="w-full p-2 border rounded bg-background text-foreground mt-1"
                                    value={editOS}
                                    onChange={e => setEditOS(e.target.value)}
                                    placeholder={device.os || "Unknown"}
                                    list="os-list"
                                />
                                <datalist id="os-list">
                                    {uniqueOS.map(o => <option key={o} value={o} />)}
                                </datalist>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-muted-foreground uppercase">Tags</label>
                                <div className="flex flex-wrap gap-2 mt-1 mb-2">
                                    {editTags.map(tag => (
                                        <span key={tag} className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs flex items-center gap-1">
                                            {tag}
                                            <button onClick={() => setEditTags(editTags.filter(t => t !== tag))} className="hover:text-red-500"><X size={12} /></button>
                                        </span>
                                    ))}
                                </div>
                                <input
                                    className="w-full p-2 border rounded bg-background text-foreground text-sm"
                                    placeholder="Add tag and press Enter"
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            const val = e.currentTarget.value.trim();
                                            if (val && !editTags.includes(val)) {
                                                setEditTags([...editTags, val]);
                                                e.currentTarget.value = '';
                                            }
                                            e.preventDefault();
                                        }
                                    }}
                                />
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-muted-foreground uppercase">Icon</label>
                                <div className="grid grid-cols-5 gap-2 mt-2">
                                    {Object.keys(IconMap).map(iconName => {
                                        const Icon = IconMap[iconName];
                                        return (
                                            <button
                                                key={iconName}
                                                onClick={() => setEditIcon(iconName)}
                                                className={`p-2 rounded flex items-center justify-center hover:bg-accent ${editIcon === iconName ? 'bg-primary/20 ring-2 ring-primary' : 'border'}`}
                                                title={iconName}
                                            >
                                                <Icon size={20} />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button onClick={() => setIsEditing(false)} className="px-3 py-1 rounded hover:bg-muted text-sm border">Cancel</button>
                                <button onClick={handleSave} className="px-3 py-1 rounded bg-primary text-primary-foreground text-sm flex items-center gap-1">
                                    <Check size={14} /> Save
                                </button>
                            </div>

                            <div className="mt-4 border-t pt-4">
                                <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">Notifications</label>
                                <div className="flex flex-col gap-2">
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={editTags.includes('notify-offline')}
                                            onChange={e => {
                                                if (e.target.checked) setEditTags([...editTags, 'notify-offline']);
                                                else setEditTags(editTags.filter(t => t !== 'notify-offline'));
                                            }}
                                            className="rounded border-gray-300 text-primary focus:ring-primary"
                                        />
                                        Notify when Offline
                                    </label>
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={editTags.includes('notify-online')}
                                            onChange={e => {
                                                if (e.target.checked) setEditTags([...editTags, 'notify-online']);
                                                else setEditTags(editTags.filter(t => t !== 'notify-online'));
                                            }}
                                            className="rounded border-gray-300 text-primary focus:ring-primary"
                                        />
                                        Notify when Online
                                    </label>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 group">
                            <div>
                                <h2 className="text-xl font-bold break-all">{device.customName || device.name || device.ip}</h2>
                                <div className="text-sm text-muted-foreground mt-1">Device Details</div>
                            </div>
                            <button
                                onClick={() => setIsEditing(true)}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-accent rounded text-muted-foreground transition-opacity"
                                title="Edit Device"
                            >
                                <Edit2 size={16} />
                            </button>
                        </div>
                    )}
                </div>
                {!isEditing && (
                    <div className="flex gap-1">
                        <button onClick={() => setShowDetails(true)} className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground" title="View Raw Data">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        </button>
                        <button onClick={onClose} className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground">
                            <X size={20} />
                        </button>
                    </div>
                )}
            </div>

            {showDetails && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowDetails(false)}>
                    <div className="bg-card w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-lg shadow-xl border p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Raw Device Data</h2>
                            <button onClick={() => setShowDetails(false)}><X size={24} /></button>
                        </div>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <DetailItem label="IP Address" value={device.ip} mono />
                                <DetailItem label="MAC Address" value={device.mac} mono />
                                <DetailItem label="mDNS Name" value={device.mdnsName || '-'} mono />
                                <DetailItem label="NetBIOS Name" value={device.netbiosName || '-'} mono />
                                <DetailItem label="Hostname (DNS)" value={detailsObj?.hostname || '-'} mono />
                                <DetailItem label="Vendor" value={device.vendor || '-'} />
                            </div>

                            {detailsObj && (
                                <div>
                                    <h3 className="font-semibold text-sm mb-2 mt-4 border-b pb-1">Nmap / Scan Details</h3>
                                    <pre className="bg-muted p-3 rounded-md text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                                        {JSON.stringify(detailsObj, null, 2)}
                                    </pre>
                                </div>
                            )}

                            <div>
                                <h3 className="font-semibold text-sm mb-2 mt-4 border-b pb-1">Full Database Record</h3>
                                <pre className="bg-muted p-3 rounded-md text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(cleanDevice, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {
                !isEditing && (
                    <div className="space-y-6 flex-1 overflow-y-auto pr-2">
                        <div className="grid grid-cols-2 gap-4">
                            <DetailItem label="Status" value={device.status}
                                badge={device.status === 'online' ? 'green' : 'gray'} />
                            <DetailItem label="Type" value={device.customType || device.type} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <DetailItem label="IP Address" value={device.ip} mono />
                            <DetailItem label="MAC Address" value={device.mac} mono />
                        </div>

                        <DetailItem label="Vendor" value={device.customVendor || device.vendor || 'Unknown'} />

                        <div className="grid grid-cols-2 gap-4">
                            <DetailItem label="First Seen" value={device.createdAt ? format(new Date(device.createdAt), 'MMM d, HH:mm') : '-'} />
                            <DetailItem label="Last Seen" value={format(new Date(device.lastSeen), 'MMM d, HH:mm')} />
                        </div>

                        {/* Detailed OS / Nmap Info Formatted */}
                        <div>
                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">OS / Network Details</div>
                            {detailsObj ? (
                                <div className="bg-muted/50 rounded-md p-3 text-sm space-y-3 border">
                                    {detailsObj.osNmap && (
                                        <div>
                                            <div className="text-xs text-muted-foreground mb-1">OS Detection</div>
                                            <div className="font-medium">{detailsObj.osNmap}</div>
                                        </div>
                                    )}
                                    {detailsObj.hostname && (
                                        <div>
                                            <div className="text-xs text-muted-foreground mb-1">Hostname</div>
                                            <div className="font-mono text-xs">{detailsObj.hostname}</div>
                                        </div>
                                    )}
                                    {detailsObj.openPorts && detailsObj.openPorts.length > 0 && (
                                        <div>
                                            <div className="text-xs text-muted-foreground mb-1">Open Ports</div>
                                            <div className="flex flex-wrap gap-1">
                                                {detailsObj.openPorts.map((p: any, i: number) => (
                                                    <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded textxs font-mono bg-background border text-foreground">
                                                        {p.port}/{p.service}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {!detailsObj.osNmap && !detailsObj.hostname && (!detailsObj.openPorts || detailsObj.openPorts.length === 0) && (
                                        <div className="text-muted-foreground italic text-xs">No specific details found.</div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-xs bg-muted p-3 rounded-md italic text-muted-foreground">
                                    {device.os || 'No detailed scan data available.'}
                                </div>
                            )}
                        </div>

                        {/* Uptime Graph */}
                        {device.history && device.history.length > 0 && (
                            <div className="border-t pt-6 h-64">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-semibold text-sm">Uptime History</h3>
                                    <div className="flex bg-muted rounded-md p-0.5">
                                        {(['24h', '7d', '30d'] as const).map((r) => (
                                            <button
                                                key={r}
                                                onClick={() => setTimeRange(r)}
                                                className={`px-2 py-0.5 text-xs font-medium rounded-sm transition-colors ${timeRange === r ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                            >
                                                {r}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="h-48 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={device.history.filter(h => {
                                            const now = Date.now();
                                            const time = new Date(h.timestamp).getTime();
                                            if (timeRange === '24h') return time > now - 24 * 60 * 60 * 1000;
                                            if (timeRange === '7d') return time > now - 7 * 24 * 60 * 60 * 1000;
                                            if (timeRange === '30d') return time > now - 30 * 24 * 60 * 60 * 1000;
                                            return true;
                                        }).map(h => ({
                                            time: new Date(h.timestamp).getTime(),
                                            displayTime: format(new Date(h.timestamp), timeRange === '24h' ? 'HH:mm' : 'MMM d'),
                                            status: h.status === 'online' ? 1 : 0
                                        }))}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                                            <XAxis
                                                dataKey="displayTime"
                                                stroke="#888"
                                                fontSize={10}
                                                tickLine={false}
                                                interval="preserveStartEnd"
                                                minTickGap={30}
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

                        {device.latency && (
                            <div className="grid grid-cols-2 gap-4">
                                <DetailItem label="Latency" value={`${device.latency} ms`} />
                                <DetailItem label="Jitter" value={`${device.jitter || 0} ms`} />
                            </div>
                        )}

                        <div className="grid grid-cols-3 gap-2 mt-6">
                            <ActionButton label="Ping" icon={<Radio size={16} />} onClick={() => handleAction('ping', 'Ping')} />
                            <ActionButton label="Scan Ports" icon={<Search size={16} />} onClick={() => handleAction('portscan', 'Port Scan')} />
                            <ActionButton label="Wake on LAN" icon={<Play size={16} />} onClick={() => handleAction('wol', 'WOL')} />
                            <ActionButton label="Test Event" icon={<span className="text-xs font-mono">TEST</span>} onClick={() => {
                                handleAction('test_event', 'Test Event');
                                // Refresh after a delay
                                setTimeout(() => onUpdate({ ...device }), 1000); // Trigger generic update or let poll handle it
                            }} />
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
                                {device.events && device.events.length > 0 ? device.events.map((e: any) => (
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
                )
            }
        </div >
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

function ActionButton({ onClick, label, loading, icon }: { onClick: () => void, label: string, loading?: boolean, icon?: any }) {
    return (
        <button
            onClick={onClick}
            disabled={loading}
            className="px-3 py-2 border rounded-md hover:bg-accent text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex flex-col gap-2 items-center justify-center h-20 text-center"
        >
            {loading ? <span className="animate-spin mb-1">⟳</span> : (icon && <span className="mb-1 text-primary">{icon}</span>)}
            {loading ? 'Running...' : label}
        </button>
    )
}
