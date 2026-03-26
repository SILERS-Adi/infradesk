import webpush from 'web-push';
import prisma from './prisma';

let initialized = false;

export async function initWebPush(): Promise<void> {
  if (initialized) return;

  let publicKey = (await prisma.setting.findUnique({ where: { key: 'vapid_public_key' } }))?.value;
  let privateKey = (await prisma.setting.findUnique({ where: { key: 'vapid_private_key' } }))?.value;

  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    await prisma.setting.upsert({ where: { key: 'vapid_public_key' }, update: { value: publicKey }, create: { key: 'vapid_public_key', value: publicKey } });
    await prisma.setting.upsert({ where: { key: 'vapid_private_key' }, update: { value: privateKey }, create: { key: 'vapid_private_key', value: privateKey } });
    console.log('[WebPush] VAPID keys generated and stored');
  }

  webpush.setVapidDetails('mailto:admin@infradesk.pl', publicKey, privateKey);
  initialized = true;
  console.log('[WebPush] Initialized');
}

export async function getVapidPublicKey(): Promise<string> {
  await initWebPush();
  const setting = await prisma.setting.findUnique({ where: { key: 'vapid_public_key' } });
  return setting!.value;
}

export async function sendPushToUser(userId: string, payload: { title: string; body: string; url?: string }): Promise<void> {
  await initWebPush();
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (!subscriptions.length) return;

  const message = JSON.stringify(payload);

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        message
      );
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      }
    }
  }
}

export async function sendPushToRole(role: string, payload: { title: string; body: string; url?: string }): Promise<void> {
  await initWebPush();
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { user: { role: role as any, isActive: true } },
  });
  if (!subscriptions.length) return;

  const message = JSON.stringify(payload);

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        message
      );
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      }
    }
  }
}
