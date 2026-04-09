import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace, requireWorkspace } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import { putSettingSchema, putSmtpSchema, smtpTestSchema } from './settings.validation';
import {
  getSettingHandler, putSettingHandler, getContactHandler, getFaqHandler,
  getSmtpHandler, putSmtpHandler, postSmtpTestHandler,
} from './settings.controller';

const router = Router();

// Public endpoints for agent
router.get('/agent/contact', getContactHandler);
router.get('/agent/faq',     getFaqHandler);

// SMTP settings (admin only)
router.get('/smtp',       authenticate, requireWorkspace, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), getSmtpHandler);
router.put('/smtp',       authenticate, requireWorkspace, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), validate(putSmtpSchema), putSmtpHandler);
router.post('/smtp/test', authenticate, requireWorkspace, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), validate(smtpTestSchema), postSmtpTestHandler);

// RODO art. 20 — Data export (all user data as JSON)
router.get('/export/my-data', authenticate, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const prisma = require('../../lib/prisma').default;

    const [user, memberships, tickets, notifications] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, createdAt: true, lastLoginAt: true },
      }),
      prisma.workspaceMembership.findMany({
        where: { userId },
        select: { role: true, status: true, workspace: { select: { id: true, name: true } } },
      }),
      prisma.ticket.findMany({
        where: { createdByUserId: userId },
        select: { id: true, ticketNumber: true, title: true, status: true, createdAt: true },
        take: 500,
      }),
      prisma.notification.findMany({
        where: { userId },
        select: { id: true, title: true, message: true, createdAt: true },
        take: 500,
      }),
    ]);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="infradesk-data-export-${userId.slice(0, 8)}.json"`);
    res.json({
      exportedAt: new Date().toISOString(),
      user,
      memberships,
      tickets,
      notifications,
    });
  } catch (err) { next(err); }
});

// Generic settings endpoints (must come after specific routes)
router.get('/:key', authenticate, requireWorkspace, getSettingHandler);
router.put('/:key', authenticate, requireWorkspace, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), validate(putSettingSchema), putSettingHandler);

export default router;
