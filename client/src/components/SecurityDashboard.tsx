
import { useState } from 'react';
import { Shield, AlertTriangle, Lock, Unlock, Search, Activity, Skull } from 'lucide-react';
import axios from 'axios';
import { Device } from '../types';


interface SecurityDashboardProps {
    devices: Device[];
    onRefresh: () => void;
}

export function SecurityDashboard({ devices, onRefresh }: SecurityDashboardProps) {
    const [scanningId, setScanningId] = useState<string | null>(null);
    const [processingId, setProcessingId] = useState<string | null>(null);

    // Filter for devices with issues or blocked status
    const blockedDevices = devices.filter(d => d.isBlocked);
    const highRiskDevices = devices.filter(d => d.riskScore && d.riskScore >= 50);

    const handleScan = async (device: Device) => {
        setScanningId(device.id);
        try {
            await axios.post(`/api/security/scan/${device.id}`);
            // Scan runs in background
            // alert(`Vulnerability scan started for ${device.name}`); 
            // Better UX: relying on UI state or toast. For now, rely on button state.
        } catch (e) {
            console.error(e);
            alert('Failed to start scan');
            setScanningId(null);
        }
        // Do NOT clear scanningId immediately if we want to show 'Scanning...' style
        // But since we don't have websocket/polling for *this specific job*, we might just clear it after a timeout 
        // or let the user refresh. 
        // Actually, let's keep it spinning for a few seconds to "ack" the request, then show a "Background" status.
        setTimeout(() => setScanningId(null), 2000);
    };

    const handleBlockToggle = async (device: Device) => {
        if (device.isBlocked) {
            if (!confirm(`Unblock ${device.name}?`)) return;
            setProcessingId(device.id);
            try {
                await axios.post(`/api/security/unblock/${device.id}`);
                onRefresh();
            } catch (e) {
                alert('Failed to unblock');
            } finally {
                setProcessingId(null);
            }
        } else {
            if (!confirm(`Are you sure you want to BLOCK ${device.name} from the network? This performs ARP poisoning.`)) return;
            setProcessingId(device.id);
            try {
                await axios.post(`/api/security/block/${device.id}`, { gateway: '' }); // backend auto-detects
                onRefresh();
            } catch (e) {
                alert('Failed to block');
            } finally {
                setProcessingId(null);
            }
        }
    };

    return (
        <div className="flex flex-col gap-6 p-1">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <Shield className="text-primary" /> Security Auditor
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Active Threat Management & Vulnerability Scanning
                    </p>
                </div>
                <div className="flex gap-2">
                    <div className="bg-red-50 text-red-700 px-3 py-1 rounded-md text-sm border border-red-100 flex items-center gap-2">
                        <Activity size={16} />
                        <span className="font-bold">{highRiskDevices.length}</span> High Risk
                    </div>
                    <div className="bg-orange-50 text-orange-700 px-3 py-1 rounded-md text-sm border border-orange-100 flex items-center gap-2">
                        <Lock size={16} />
                        <span className="font-bold">{blockedDevices.length}</span> Blocked
                    </div>
                </div>
            </div>

            {/* Warning Banner */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
                <div className="text-sm text-amber-900">
                    <p className="font-semibold">Professional Tools Active</p>
                    <p>Using the Kill Switch (ARP Poisoning) or Vulnerability Scanner on networks you do not own is illegal. Use responsibly.</p>
                </div>
            </div>

            {/* Device List */}
            <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 text-muted-foreground font-medium">
                        <tr>
                            <th className="p-4">Device</th>
                            <th className="p-4">Status</th>
                            <th className="p-4">Ports</th>
                            <th className="p-4">Risk Score</th>
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {devices.map(device => (
                            <tr key={device.id} className="hover:bg-muted/20 transition-colors">
                                <td className="p-4">
                                    <div className="font-medium text-foreground">{device.name || device.ip}</div>
                                    <div className="text-xs text-muted-foreground">{device.ip} • {device.mac}</div>
                                </td>
                                <td className="p-4">
                                    {device.isBlocked ? (
                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                                            <Lock size={12} /> Blocked
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                                            <Shield size={12} /> Protected
                                        </span>
                                    )}
                                </td>
                                <td className="p-4 text-muted-foreground">
                                    {/* We don't have ports in the Device list prop usually, unless expanded. 
                                        Assuming we might need to fetch or just show "--" if unavailable. 
                                        Let's assume we don't have deeply nested ports in the simplistic list.
                                    */}
                                    <span className="font-mono text-xs">--</span>
                                </td>
                                <td className="p-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className={`h-full ${device.riskScore && device.riskScore > 50 ? 'bg-red-500' : 'bg-emerald-500'}`}
                                                style={{ width: `${device.riskScore || 0}%` }}
                                            />
                                        </div>
                                        <span className="font-mono text-xs">{device.riskScore || 0}%</span>
                                    </div>
                                </td>
                                <td className="p-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            onClick={() => handleScan(device)}
                                            disabled={!!scanningId}
                                            className={`p-2 hover:bg-accent rounded-md text-muted-foreground hover:text-blue-600 transition-colors ${scanningId === device.id ? 'text-blue-600' : ''}`}
                                            title="Run Vulnerability Scan"
                                        >
                                            {scanningId === device.id ? <Activity size={16} className="animate-spin" /> : <Search size={16} />}
                                        </button>

                                        <button
                                            onClick={() => handleBlockToggle(device)}
                                            disabled={processingId === device.id}
                                            className={`p-2 rounded-md transition-colors ${device.isBlocked
                                                ? 'bg-red-100 text-red-600 hover:bg-red-200'
                                                : 'hover:bg-accent text-muted-foreground hover:text-red-600'
                                                }`}
                                            title={device.isBlocked ? "Unblock Network Access" : "Block Network Access (Kill Switch)"}
                                        >
                                            {device.isBlocked ? <Unlock size={16} /> : <Skull size={16} />}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
