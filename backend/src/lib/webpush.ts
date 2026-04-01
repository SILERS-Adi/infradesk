// @ts-ignore — no @types/web-push available
import webpush from 'web-push';
import prisma from './prisma';

let initialized = false;

export async function initWebPush(): Promise<void> {
  if (initialized) return;

  let publicKey = (await prisma.setting.findFirst({ where: { key: 'vapid_public_key' } }))?.value;
  let privateKey = (await prisma.setting.findFirst({ where: { key: 'vapid_private_key' } }))?.value;

  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    const existPub = await prisma.setting.findFirst({ where: { key: 'vapid_public_key' } });
    if (existPub) await prisma.setting.update({ where: { id: existPub.id }, data: { value: publicKey! } });
    else await prisma.setting.create({ data: { key: 'vapid_public_key', value: publicKey! } });
    const existPriv = await prisma.setting.findFirst({ where: { key: 'vapid_private_key' } });
    if (existPriv) await prisma.setting.update({ where: { id: existPriv.id }, data: { value: privateKey! } });
    else await prisma.setting.create({ data: { key: 'vapid_private_key', value: privateKey! } });
    console.log('[WebPush] VAPID keys generated and stored');
  }

  webpush.setVapidDetails('mailto:admin@infradesk.pl', publicKey!, privateKey!);
  initialized = true;
  console.log('[WebPush] Initialized');
}

export async function getVapidPublicKey(): Promise<string> {
  await initWebPush();
  const setting = await prisma.setting.findFirst({ where: { key: 'vapid_public_key' } });
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

export async function sendPushToRole(_role: string, payload: { title: string; body: string; url?: string }): Promise<void> {
  await initWebPush();
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { user: { isActive: true } },
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
