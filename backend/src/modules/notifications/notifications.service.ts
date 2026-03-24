import prisma from '../../lib/prisma';
import { SendNotificationInput } from './notifications.validation';

export async function sendNotifications(data: SendNotificationInput, fromUserId: string) {
  const notifications = await prisma.$transaction(
    data.userIds.map(userId =>
      prisma.notification.create({
        data: { userId, fromUserId, title: data.title, message: data.message },
      })
    )
  );
  return { sent: notifications.length };
}

export async function getMyNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true, title: true, message: true, readAt: true, createdAt: true,
      fromUser: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}

export async function markRead(userId: string, ids: string[]) {
  await prisma.notification.updateMany({
    where: { userId, id: { in: ids }, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function getUnreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
