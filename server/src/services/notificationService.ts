import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface Notification {
    id: string;
    type: 'new_device' | 'speed_drop' | 'device_status';
    title: string;
    message: string;
    timestamp: string; // ISO string
    read: boolean;
    metadata?: any;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE_PATH = path.join(DATA_DIR, 'notifications.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

class NotificationService {
    private notifications: Notification[] = [];

    constructor() {
        this.load();
    }

    private load() {
        try {
            if (fs.existsSync(FILE_PATH)) {
                const data = fs.readFileSync(FILE_PATH, 'utf-8');
                this.notifications = JSON.parse(data);
            }
        } catch (error) {
            console.error('Failed to load notifications:', error);
            this.notifications = [];
        }
    }

    private save() {
        try {
            fs.writeFileSync(FILE_PATH, JSON.stringify(this.notifications, null, 2));
        } catch (error) {
            console.error('Failed to save notifications:', error);
        }
    }

    public getAll(): Notification[] {
        // Return sorted by newest first
        return [...this.notifications].sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
    }

    public add(data: Omit<Notification, 'id' | 'timestamp' | 'read'>) {
        const newNotification: Notification = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            read: false,
            ...data
        };

        this.notifications.unshift(newNotification);

        // Limit to last 100 notifications to prevent infinite growth
        if (this.notifications.length > 100) {
            this.notifications = this.notifications.slice(0, 100);
        }

        this.save();
        return newNotification;
    }

    public clear() {
        this.notifications = [];
        this.save();
    }

    public remove(id: string) {
        this.notifications = this.notifications.filter(n => n.id !== id);
        this.save();
    }

    public markAsRead(id: string) {
        const notification = this.notifications.find(n => n.id === id);
        if (notification) {
            notification.read = true;
            this.save();
        }
    }
}

export const notificationService = new NotificationService();
