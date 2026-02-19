
import { useState } from 'react';
import { Shield, AlertTriangle, Lock, Unlock, Search, Activity, Skull, Check } from 'lucide-react';
import axios from 'axios';
import { Device } from '../types';


interface SecurityDashboardProps {
    devices: Device[];
    onRefresh: () => void;
}

export function SecurityDashboard({ devices, onRefresh }: SecurityDashboardProps) {
    const [scanningId, setScanningId] = useState<string | null>(null);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [expandedDeviceId, setExpandedDeviceId] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'high_risk' | 'blocked'>('all');

    // Filter Logic
    const processedDevices = devices.map(d => {
        const currentRisk = d.riskScore || 0;
        const ignoredRisk = d.ignoredRiskScore || 0;
        // Effective risk is positive if current > ignored.
        // If current <= ignored, we consider it "acknowledged" (effective 0 for alerting/sorting purposes, but we still show the score)
        const isNewRisk = currentRisk > ignoredRisk;
        return { ...d, isNewRisk };
    });

    const blockedDevices = processedDevices.filter(d => d.isBlocked);
    // High risk = score > 50 AND it's a NEW risk (unacknowledged)
    const highRiskDevices = processedDevices.filter(d => d.isNewRisk && (d.riskScore || 0) >= 50);

    const visibleDevices = processedDevices.filter(d => {
        if (filter === 'blocked') return d.isBlocked;
        if (filter === 'high_risk') return d.isNewRisk && (d.riskScore || 0) > 0;
        return true;
    }).sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));


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

    const handleIgnoreRisk = async (device: Device) => {
        if (!confirm(`Acknowledge current risk level (${device.riskScore}) for ${device.name}? Future alerts will only trigger if risk increases.`)) return;
        try {
            await axios.post(`/api/security/ignore/${device.id}`);
            onRefresh();
        } catch (e) {
            alert('Failed to acknowledge risk');
        }
    };

    const toggleExpand = (id: string) => {
        setExpandedDeviceId(expandedDeviceId === id ? null : id);
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
                    <button
                        onClick={() => setFilter(filter === 'high_risk' ? 'all' : 'high_risk')}
                        className={`px-3 py-1 rounded-md text-sm border flex items-center gap-2 transition-colors ${filter === 'high_risk' ? 'bg-red-100 border-red-200 text-red-800' : 'bg-red-50 text-red-700 border-red-100 hover:bg-red-100'}`}
                    >
                        <Activity size={16} />
                        <span className="font-bold">{highRiskDevices.length}</span> High Risk
                    </button>
                    <button
                        onClick={() => setFilter(filter === 'blocked' ? 'all' : 'blocked')}
                        className={`px-3 py-1 rounded-md text-sm border flex items-center gap-2 transition-colors ${filter === 'blocked' ? 'bg-orange-100 border-orange-200 text-orange-800' : 'bg-orange-50 text-orange-700 border-orange-100 hover:bg-orange-100'}`}
                    >
                        <Lock size={16} />
                        <span className="font-bold">{blockedDevices.length}</span> Blocked
                    </button>
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
                            <th className="p-4">Risk Level</th>
                            <th className="p-4 text-center">CVEs</th>
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {visibleDevices.map(device => {
                            const riskLevel = device.riskScore || 0;
                            const isIgnored = !device.isNewRisk && riskLevel > 0;

                            return (
                                <>
                                    <tr key={device.id} className={`hover:bg-muted/20 transition-colors ${expandedDeviceId === device.id ? 'bg-muted/30' : ''}`}>
                                        <td className="p-4 cursor-pointer" onClick={() => toggleExpand(device.id)}>
                                            <div className="font-medium text-foreground flex items-center gap-2">
                                                {device.name || device.ip}
                                                {expandedDeviceId === device.id ? <div className="text-xs text-muted-foreground">(Hide Details)</div> : null}
                                            </div>
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
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full ${riskLevel > 50 ? 'bg-red-500' : 'bg-emerald-500'} ${isIgnored ? 'opacity-30' : ''}`}
                                                        style={{ width: `${riskLevel}%` }}
                                                    />
                                                </div>
                                                <span className="font-mono text-xs">{riskLevel}%</span>
                                                {isIgnored && <span className="text-[10px] uppercase font-bold text-muted-foreground bg-muted px-1 rounded">Ack</span>}
                                            </div>
                                        </td>
                                        <td className="p-4 text-center header-cve">
                                            {(() => {
                                                try {
                                                    const vulns = JSON.parse(device.vulnerabilities || '[]');
                                                    if (vulns.length > 0) {
                                                        return <span className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">{vulns.length}</span>;
                                                    }
                                                    return <span className="text-muted-foreground text-xs">-</span>;
                                                } catch { return <span className="text-muted-foreground text-xs">-</span>; }
                                            })()}
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {device.isNewRisk && (
                                                    <button
                                                        onClick={() => handleIgnoreRisk(device)}
                                                        className="p-2 hover:bg-green-100 rounded-md text-muted-foreground hover:text-green-700 transition-colors"
                                                        title="Acknowledge & Ignore Current Risk"
                                                    >
                                                        <Check size={16} />
                                                    </button>
                                                )}

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
                                    {expandedDeviceId === device.id && (
                                        <tr className="bg-muted/10">
                                            <td colSpan={4} className="p-4">
                                                <div className="text-sm">
                                                    <h4 className="font-semibold mb-2">Security Details</h4>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="bg-card p-3 rounded border">
                                                            <h5 className="text-xs font-bold text-muted-foreground mb-1 uppercase">Vendor Info</h5>
                                                            <p className="font-mono text-xs">{device.vendor || 'Unknown'}</p>
                                                            <p className="font-mono text-xs mt-1">{device.os || 'OS Unknown'}</p>
                                                        </div>
                                                        <div className="bg-card p-3 rounded border">
                                                            <h5 className="text-xs font-bold text-muted-foreground mb-1 uppercase">Analysis</h5>
                                                            {(!device.vulnerabilities || device.vulnerabilities === '[]') ? (
                                                                <p className="text-muted-foreground text-xs italic">No specific vulnerabilities found.</p>
                                                            ) : (
                                                                <div className="space-y-1">
                                                                    <p className="text-xs font-semibold text-red-600">Potential Issues found:</p>
                                                                    <pre className="text-[10px] overflow-x-auto whitespace-pre-wrap font-mono bg-muted/50 p-2 rounded">
                                                                        {JSON.parse(device.vulnerabilities || '[]').join('\n')}
                                                                    </pre>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </>
                            )
                        })}
                        {visibleDevices.length === 0 && (
                            <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No devices found matching filters.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
