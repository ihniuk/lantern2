import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend } from 'recharts';
import { ArrowDown, ArrowUp, Activity } from 'lucide-react';
import { SpeedTestResult, Settings } from '../types';

interface SpeedTestDashboardProps {
    history: SpeedTestResult[];
    stats: any;
    settings: Settings;
    range: '24h' | '7d' | '14d' | '30d';
    onRangeChange: (range: '24h' | '7d' | '14d' | '30d') => void;
}

export function SpeedTestDashboard({ history, stats, settings, range, onRangeChange }: SpeedTestDashboardProps) {

    // Calculate median for last 24h if we want reference lines on the graph
    const calcMedian = (values: number[]) => {
        if (values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    const medianDL = history ? calcMedian(history.map(h => h.download)) : 0;
    const medianUL = history ? calcMedian(history.map(h => h.upload)) : 0;

    // Prepare data (reversed for chart if history is new-first)
    const graphData = history ? [...history].reverse().map(h => ({
        time: format(new Date(h.timestamp), range === '24h' ? 'HH:mm' : 'MMM d HH:mm'),
        download: h.download,
        upload: h.upload,
        original: h
    })) : [];

    // Calculate Next Run
    let nextRunText = "";
    if (settings && settings.speedTestIntervalMinutes && settings.speedTestIntervalMinutes > 0 && history && history.length > 0) {
        const lastRun = new Date(history[0].timestamp).getTime();
        const nextRun = new Date(lastRun + (settings.speedTestIntervalMinutes * 60000));
        // Only show if it's in the future, otherwise it's "Pending..." or similar? 
        // Actually simple format is fine.
        nextRunText = ` • Next Run: ${format(nextRun, 'HH:mm')}`;
    } else if (settings && (!settings.speedTestIntervalMinutes || settings.speedTestIntervalMinutes === 0)) {
        // nextRunText = " • Schedule Disabled";
    }

    return (
        <div className="flex flex-col gap-6 p-1">
            {/* Header & Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Internet Speed Monitor</h2>
                    <div className="text-sm text-muted-foreground mt-1">
                        Performance & Historical Analysis
                        {nextRunText}
                    </div>
                </div>

                <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg self-start md:self-auto">
                    {(['24h', '7d', '14d', '30d'] as const).map((r) => (
                        <button
                            key={r}
                            onClick={() => onRangeChange(r)}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${range === r
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                                }`}
                        >
                            {r.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard title="Last 24h Avg" dl={stats.day?.download} ul={stats.day?.upload} ping={stats.day?.ping} />
                    <StatCard title="7 Day Avg" dl={stats.week?.download} ul={stats.week?.upload} ping={stats.week?.ping} />
                    <StatCard title="30 Day Avg" dl={stats.month?.download} ul={stats.month?.upload} ping={stats.month?.ping} />
                    <StatCard title="All Time Avg" dl={stats.year?.download} ul={stats.year?.upload} ping={stats.year?.ping} />
                </div>
            )}

            {/* Main Graph - Fixed Height to prevent overflow issues */}
            <div className="h-[400px] w-full bg-card border rounded-lg p-4 shadow-sm flex flex-col">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">Speed History ({range === '24h' ? 'Last 24 Hours' : `Last ${range.replace('d', ' Days')}`}) & Median Trend</h3>
                <div className="flex-1 w-full min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={graphData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} minTickGap={30} />
                            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
                            <Tooltip
                                contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                                itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                                cursor={{ fill: 'hsl(var(--muted)/0.2)' }}
                            />
                            <Legend />
                            <Bar dataKey="download" name="Download" fill="#10b981" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="upload" name="Upload" fill="#3b82f6" radius={[4, 4, 0, 0]} />

                            {/* Median Lines */}
                            <ReferenceLine y={medianDL} label="Avg DL" stroke="#047857" strokeDasharray="3 3" />
                            <ReferenceLine y={medianUL} label="Avg UL" stroke="#1d4ed8" strokeDasharray="3 3" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Recent List */}
            <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-muted text-muted-foreground text-xs uppercase font-semibold">
                            <tr>
                                <th className="p-3">Time</th>
                                <th className="p-3">Download</th>
                                <th className="p-3">Upload</th>
                                <th className="p-3">Ping</th>
                                <th className="p-3">ISP / Location</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {history && [...history].map(h => (
                                <tr key={h.id} className="hover:bg-muted/50">
                                    <td className="p-3 font-mono text-xs whitespace-nowrap">{format(new Date(h.timestamp), 'MMM d, HH:mm')}</td>
                                    <td className="p-3 text-green-600 font-medium whitespace-nowrap">{h.download.toFixed(1)} Mbps</td>
                                    <td className="p-3 text-blue-600 font-medium whitespace-nowrap">{h.upload.toFixed(1)} Mbps</td>
                                    <td className="p-3 text-muted-foreground whitespace-nowrap">{h.ping.toFixed(0)} ms</td>
                                    <td className="p-3 text-muted-foreground text-xs">
                                        <div className="truncate max-w-[200px]" title={`${h.isp} (${h.serverLocation})`}>
                                            {h.isp} ({h.serverLocation})
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, dl, ul, ping }: { title: string, dl: number, ul: number, ping: number }) {
    if (!dl) return <div className="p-4 rounded-lg border bg-card/50 text-muted-foreground text-sm flex items-center justify-center">No Data</div>;

    return (
        <div className="p-4 rounded-lg border bg-card text-card-foreground shadow-sm">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">{title}</h3>
            <div className="grid grid-cols-3 gap-2 text-center divide-x">
                <div>
                    <div className="flex items-center justify-center gap-1 text-green-500 mb-1"><ArrowDown size={14} /></div>
                    <div className="text-lg font-bold">{dl.toFixed(0)}</div>
                    <div className="text-[10px] text-muted-foreground">Mbps</div>
                </div>
                <div>
                    <div className="flex items-center justify-center gap-1 text-blue-500 mb-1"><ArrowUp size={14} /></div>
                    <div className="text-lg font-bold">{ul.toFixed(0)}</div>
                    <div className="text-[10px] text-muted-foreground">Mbps</div>
                </div>
                <div>
                    <div className="flex items-center justify-center gap-1 text-orange-500 mb-1"><Activity size={14} /></div>
                    <div className="text-lg font-bold">{ping.toFixed(0)}</div>
                    <div className="text-[10px] text-muted-foreground">ms</div>
                </div>
            </div>
        </div>
    )
}
