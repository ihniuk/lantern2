import cron from 'node-cron';
import { createBackup } from './dataManager';

export const initCronJobs = () => {
    console.log('Initializing Cron Jobs...');

    // Daily backup at 3:00 AM
    cron.schedule('0 3 * * *', async () => {
        console.log('Starting daily backup...');
        try {
            const fileName = await createBackup();
            console.log(`Backup created successfully: ${fileName}`);
        } catch (error) {
            console.error('Backup failed:', error);
        }
    });
};
