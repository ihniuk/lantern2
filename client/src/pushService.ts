import axios from 'axios';

const PUBLIC_VAPID_KEY_URL = '/api/notifications/vapid';
const SUBSCRIBE_URL = '/api/notifications/subscribe';

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export async function subscribeUserToPush() {
    if (!('serviceWorker' in navigator)) return;
    if (!('PushManager' in window)) return;

    try {
        const register = await navigator.serviceWorker.ready;

        // Get VAPID Key
        const { data } = await axios.get(PUBLIC_VAPID_KEY_URL);
        const convertedVapidKey = urlBase64ToUint8Array(data.publicKey);

        const subscription = await register.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey
        });

        await axios.post(SUBSCRIBE_URL, { subscription });
        console.log('User subscribed to push notifications');
        return true;
    } catch (error) {
        console.error('Failed to subscribe to push', error);
        return false;
    }
}
