import webpush from 'web-push';
import prisma from '../prisma';

let vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || ''
};

// Generate keys if missing (for dev simplicity, though ideally provided via ENV)
if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    const keys = webpush.generateVAPIDKeys();
    vapidKeys = keys;
    console.log('Generated VAPID Keys:', keys);
    console.log('Make sure to save them to your ENV variables to persist subscriptions across restarts!');
}

webpush.setVapidDetails(
    'mailto:admin@example.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

export const getVapidPublicKey = () => vapidKeys.publicKey;

export interface NotificationPayload {
    title: string;
    body?: string;
    icon?: string;
    url?: string;
}

export const sendNotification = async (payload: NotificationPayload) => {
    try {
        const subscriptions = await prisma.pushSubscription.findMany();

        const payloadString = JSON.stringify(payload);

        const promises = subscriptions.map(async (sub) => {
            try {
                const subscription = {
                    endpoint: sub.endpoint,
                    keys: JSON.parse(sub.keys)
                };
                await webpush.sendNotification(subscription as any, payloadString);
            } catch (error: any) {
                if (error.statusCode === 410 || error.statusCode === 404) {
                    // Subscription expired or gone
                    await prisma.pushSubscription.delete({ where: { id: sub.id } });
                } else {
                    console.error('Error sending notification to', sub.id, error);
                }
            }
        });

        await Promise.all(promises);
        console.log(`Sent notification to ${subscriptions.length} subscribers.`);
    } catch (error) {
        console.error('Failed to send notifications', error);
    }
};
