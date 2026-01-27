import prisma from '../prisma';
import fs from 'fs';
import path from 'path';

const BACKUP_DIR = path.join(process.cwd(), 'backups');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

export const exportDevicesToCSV = async (): Promise<string> => {
    const devices = await prisma.device.findMany();

    if (devices.length === 0) return '';

    // CSV Header
    const fields = ['mac', 'ip', 'name', 'customName', 'vendor', 'type', 'status', 'os', 'lastSeen'];
    const header = fields.join(',');

    // CSV Rows
    const rows = devices.map(device => {
        return fields.map(field => {
            const value = (device as any)[field];
            // Handle commas and quotes in content
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value !== null && value !== undefined ? value : '';
        }).join(',');
    });

    return [header, ...rows].join('\n');
};

export const importDevicesFromCSV = async (csvData: string): Promise<{ success: number; failed: number; errors: string[] }> => {
    const lines = csvData.trim().split('\n');
    if (lines.length < 2) return { success: 0, failed: 0, errors: ['Empty or invalid CSV'] };

    const header = lines[0].split(',').map(h => h.trim());
    const macIndex = header.indexOf('mac');

    if (macIndex === -1) return { success: 0, failed: lines.length - 1, errors: ['Missing MAC address column'] };

    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        // Simple CSV parsing (this is fragile for complex CSVs, but sufficient for our export format)
        // A better approach would be to use a library like 'csv-parse', but avoiding dependecies for now.
        // We'll handle quoted strings crudely.
        const values: string[] = [];
        let inQuote = false;
        let currentValue = '';

        for (let char of line) {
            if (char === '"') {
                inQuote = !inQuote;
            } else if (char === ',' && !inQuote) {
                values.push(currentValue.trim());
                currentValue = '';
            } else {
                currentValue += char;
            }
        }
        values.push(currentValue.trim());

        const mac = values[macIndex];

        if (!mac) {
            results.failed++;
            results.errors.push(`Line ${i + 1}: Missing MAC`);
            continue;
        }

        try {
            const data: any = {};
            header.forEach((h, index) => {
                const val = values[index];
                if (val && h !== 'mac') {
                    // Convert date strings if needed, or leave as string
                    // Prisma handles date strings usually fine if ISO
                    data[h] = val;
                }
            });

            // Clean up booleans or numbers if we had any
            // Currently our exported fields are mostly strings. 

            await prisma.device.upsert({
                where: { mac },
                update: data,
                create: { mac, ip: data.ip || '0.0.0.0', ...data }
            });
            results.success++;
        } catch (e: any) {
            results.failed++;
            results.errors.push(`Line ${i + 1}: ${e.message}`);
        }
    }

    return results;
};

export const createBackup = async () => {
    const devices = await prisma.device.findMany();
    const settings = await prisma.settings.findUnique({ where: { id: 'default' } });

    const backupData = {
        timestamp: new Date().toISOString(),
        settings,
        devices
    };

    const fileName = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const filePath = path.join(BACKUP_DIR, fileName);

    fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));

    // Rotate backups: keep last 10
    const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
        .sort(); // Lexicographical sort works for ISO timestamps

    while (files.length > 10) {
        const toDelete = files.shift();
        if (toDelete) fs.unlinkSync(path.join(BACKUP_DIR, toDelete));
    }

    return fileName;
};
