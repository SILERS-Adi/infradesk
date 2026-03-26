import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { sendMail } from '../../lib/mailer';

export async function verifyPin(pin: string): Promise<{ valid: boolean }> {
  // Check User.downloadPin (case-insensitive)
  const userWithPin = await prisma.user.findFirst({
    where: {
      downloadPin: {
        equals: pin,
        mode: 'insensitive',
      },
      isActive: true,
    },
  });

  if (userWithPin) {
    return { valid: true };
  }

  // Check DownloadPinRequest (exact match, not expired, not used)
  const now = new Date();
  const pinRequest = await prisma.downloadPinRequest.findFirst({
    where: {
      pin,
      expiresAt: { gt: now },
      usedAt: null,
    },
  });

  if (pinRequest) {
    await prisma.downloadPinRequest.update({
      where: { id: pinRequest.id },
      data: { usedAt: now },
    });
    return { valid: true };
  }

  return { valid: false };
}

export async function requestPin(email: string): Promise<{ sent: boolean }> {
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.downloadPinRequest.create({
    data: {
      email,
      pin,
      expiresAt,
    },
  });

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #1e40af;">PIN do pobrania plików InfraDesk</h2>
      <p>Oto Twój jednorazowy PIN do pobrania plików:</p>
      <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1e3a5f; padding: 20px; background: #f0f4ff; border-radius: 8px; text-align: center; margin: 20px 0;">
        ${pin}
      </div>
      <p style="color: #6b7280; font-size: 14px;">PIN jest ważny przez 24 godziny i może zostać użyty tylko raz.</p>
      <p style="color: #6b7280; font-size: 12px;">Jeśli nie składałeś/-aś tej prośby, zignoruj tę wiadomość.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
      <p style="color: #9ca3af; font-size: 11px;">InfraDesk by SILERS · infradesk.pl</p>
    </div>
  `;

  await sendMail(email, 'Twój PIN do pobrania plików InfraDesk', html);

  return { sent: true };
}

export async function listPinRequests() {
  return prisma.downloadPinRequest.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}
