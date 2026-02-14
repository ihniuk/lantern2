
import prisma from '../prisma';

async function main() {
    console.log('Checking devices and events...');
    const devices = await prisma.device.findMany({
        include: {
            _count: {
                select: { events: true }
            }
        }
    });

    console.log(`Found ${devices.length} devices.`);
    for (const d of devices) {
        console.log(`Device: ${d.name || d.ip} (${d.mac}) - Events: ${d._count.events}`);
    }

    if (devices.length > 0) {
        const target = devices[0];
        console.log(`\nCreating test event for ${target.name || target.ip}...`);
        try {
            const event = await prisma.event.create({
                data: {
                    type: 'test',
                    message: 'Debug Test Event ' + new Date().toISOString(),
                    deviceId: target.id
                }
            });
            console.log('Event created:', event);
        } catch (e) {
            console.error('Failed to create event:', e);
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
