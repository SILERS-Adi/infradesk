import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import prisma from '../../lib/prisma';
import { sendMail, emailTemplate, emailButton, emailHeading, emailText, emailMuted, emailInfoBox } from '../../lib/mailer';
import { AppError } from '../../middleware/errorHandler';
import crypto from 'crypto';

const router = Router();
router.use(authenticate);

// ── List sharing relationships for current workspace ──
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId;
    if (!wsId) { res.status(400).json({ error: 'Workspace context required' }); return; }

    // Companies I manage (as MSP) — include users with access
    const managing = await prisma.workspaceManagement.findMany({
      where: { mspWorkspaceId: wsId, status: { not: 'DETACHED' } },
      include: {
        companyWorkspace: { select: { id: true, name: true, slug: true, type: true, email: true } },
        memberships: {
          where: { status: 'ACTIVE' },
          select: { id: true, role: true, scopeType: true, user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
      },
    });

    // MSPs that manage me — include MSP users who have access to my workspace
    const managedBy = await prisma.workspaceManagement.findMany({
      where: { companyWorkspaceId: wsId, status: { not: 'DETACHED' } },
      include: {
        mspWorkspace: { select: { id: true, name: true, slug: true, type: true, email: true } },
        memberships: {
          where: { status: 'ACTIVE' },
          select: { id: true, role: true, scopeType: true, user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
      },
    });

    // Pending invitations sent by me
    const sentInvites = await prisma.sharingInvitation.findMany({
      where: { fromWorkspaceId: wsId, status: 'PENDING' },
    });

    // Pending invitations received
    const receivedInvites = await prisma.sharingInvitation.findMany({
      where: { toEmail: { in: [req.user!.email] }, status: 'PENDING' },
      include: { fromWorkspace: { select: { id: true, name: true, slug: true } } },
    });

    res.json({ managing, managedBy, sentInvites, receivedInvites });
  } catch (err) { next(err); }
});

// ── Send invitation to share access ──
router.post('/invite', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId;
    const userId = req.user!.userId;
    if (!wsId) { res.status(400).json({ error: 'Workspace context required' }); return; }

    const { email, accessLevel, scope, deviceIds, locationIds, message } = req.body;
    if (!email) { res.status(400).json({ error: 'Email jest wymagany' }); return; }

    // Check ownership
    const membership = await prisma.workspaceMembership.findFirst({
      where: { userId, workspaceId: wsId, role: { in: ['OWNER', 'ADMIN'] }, status: 'ACTIVE' },
    });
    if (!membership) { res.status(403).json({ error: 'Brak uprawnień' }); return; }

    const workspace = await prisma.workspace.findUnique({ where: { id: wsId }, select: { name: true, email: true } });
    const token = crypto.randomBytes(32).toString('hex');

    const invite = await prisma.sharingInvitation.create({
      data: {
        fromWorkspaceId: wsId,
        toEmail: email.toLowerCase().trim(),
        accessLevel: accessLevel || 'FULL_MANAGEMENT',
        scope: scope || 'ALL', // ALL | SELECTED
        deviceIds: deviceIds || [],
        locationIds: locationIds || [],
        message: message || null,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        createdByUserId: userId,
      },
    });

    // Send email
    const acceptUrl = `${process.env.FRONTEND_URL || 'https://infradesk.pl'}/sharing/accept?token=${token}`;
    const accessLabel = accessLevel === 'FULL_MANAGEMENT' ? 'Pełne zarządzanie' : accessLevel === 'REMOTE_SUPPORT' ? 'Wsparcie zdalne' : 'Monitoring';
    const scopeLabel = scope === 'ALL' ? 'Wszystkie urządzenia' : `Wybrane (${(deviceIds?.length || 0) + (locationIds?.length || 0)})`;
    await sendMail(email, `Zaproszenie do współpracy — ${workspace?.name || 'InfraDesk'}`, emailTemplate(
      emailHeading('Zaproszenie do współpracy') +
      emailText(`Firma <strong>${workspace?.name}</strong> zaprasza Cię do współpracy w ramach platformy InfraDesk.`) +
      (message ? emailInfoBox(message) : '') +
      emailText(`Zakres dostępu: <strong>${accessLabel}</strong><br/>Urządzenia: <strong>${scopeLabel}</strong>`) +
      emailButton('Akceptuj zaproszenie', acceptUrl) +
      emailMuted('Link jest ważny przez <strong>7 dni</strong>.')
    )).catch(err => console.error('Failed to send sharing invite:', err.message));

    res.status(201).json(invite);
  } catch (err) { next(err); }
});

// ── Request access (company requests IT company to manage them) ──
router.post('/request', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId;
    const userId = req.user!.userId;
    if (!wsId) { res.status(400).json({ error: 'Workspace context required' }); return; }

    const { email, scope, deviceIds, locationIds, message } = req.body;
    if (!email) { res.status(400).json({ error: 'Email firmy IT jest wymagany' }); return; }

    const membership = await prisma.workspaceMembership.findFirst({
      where: { userId, workspaceId: wsId, role: { in: ['OWNER', 'ADMIN'] }, status: 'ACTIVE' },
    });
    if (!membership) { res.status(403).json({ error: 'Brak uprawnień' }); return; }

    const workspace = await prisma.workspace.findUnique({ where: { id: wsId }, select: { name: true } });
    const token = crypto.randomBytes(32).toString('hex');

    const invite = await prisma.sharingInvitation.create({
      data: {
        fromWorkspaceId: wsId,
        toEmail: email.toLowerCase().trim(),
        accessLevel: 'FULL_MANAGEMENT',
        scope: scope || 'ALL',
        deviceIds: deviceIds || [],
        locationIds: locationIds || [],
        message: message || null,
        token,
        direction: 'REQUEST', // company requests MSP
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdByUserId: userId,
      },
    });

    const acceptUrl = `${process.env.FRONTEND_URL || 'https://infradesk.pl'}/sharing/accept?token=${token}`;
    await sendMail(email, `Prośba o obsługę IT — ${workspace?.name || 'InfraDesk'}`, emailTemplate(
      emailHeading('Prośba o obsługę IT') +
      emailText(`Firma <strong>${workspace?.name}</strong> prosi o objęcie jej obsługą informatyczną w ramach InfraDesk.`) +
      (message ? emailInfoBox(message) : '') +
      emailText(`Zakres: <strong>${scope === 'ALL' ? 'Wszystkie urządzenia' : 'Wybrane urządzenia'}</strong>`) +
      emailButton('Zaakceptuj i zarządzaj', acceptUrl) +
      emailMuted('Link ważny 7 dni.')
    )).catch(err => console.error('Failed to send sharing request:', err.message));

    res.status(201).json(invite);
  } catch (err) { next(err); }
});

// ── Accept invitation ──
router.post('/accept', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { token } = req.body;
    if (!token) { res.status(400).json({ error: 'Token jest wymagany' }); return; }

    const invite = await prisma.sharingInvitation.findUnique({ where: { token } });
    if (!invite) throw new AppError('Nieprawidłowy link zaproszenia', 400);
    if (invite.status !== 'PENDING') throw new AppError('To zaproszenie zostało już wykorzystane', 400);
    if (invite.expiresAt < new Date()) throw new AppError('Zaproszenie wygasło', 400);

    // Find acceptor's workspace
    const acceptorMembership = await prisma.workspaceMembership.findFirst({
      where: { userId, role: { in: ['OWNER', 'ADMIN'] }, status: 'ACTIVE' },
      include: { workspace: true },
      orderBy: { isDefault: 'desc' },
    });
    if (!acceptorMembership) throw new AppError('Nie masz workspace z uprawnieniami ADMIN', 400);

    const isRequest = invite.direction === 'REQUEST';
    // REQUEST: company asks MSP → MSP accepts → MSP manages company
    // INVITE (default): workspace invites someone → they become managed or manager
    const mspId = isRequest ? acceptorMembership.workspaceId : invite.fromWorkspaceId;
    const companyId = isRequest ? invite.fromWorkspaceId : acceptorMembership.workspaceId;

    // Create WorkspaceManagement
    const existing = await prisma.workspaceManagement.findFirst({
      where: { mspWorkspaceId: mspId, companyWorkspaceId: companyId },
    });

    let mgmt;
    if (existing) {
      mgmt = await prisma.workspaceManagement.update({
        where: { id: existing.id },
        data: { status: 'ACTIVE', accessLevel: invite.accessLevel as any },
      });
    } else {
      mgmt = await prisma.workspaceManagement.create({
        data: {
          mspWorkspaceId: mspId,
          companyWorkspaceId: companyId,
          status: 'ACTIVE',
          accessLevel: invite.accessLevel as any,
        },
      });
    }

    // Create membership for MSP users in company workspace (if not exists)
    const mspOwner = await prisma.workspaceMembership.findFirst({
      where: { workspaceId: mspId, role: 'OWNER', status: 'ACTIVE' },
    });
    if (mspOwner) {
      const existingMembership = await prisma.workspaceMembership.findFirst({
        where: { userId: mspOwner.userId, workspaceId: companyId },
      });
      if (!existingMembership) {
        const newMembership = await prisma.workspaceMembership.create({
          data: {
            userId: mspOwner.userId,
            workspaceId: companyId,
            role: 'ADMIN',
            source: 'MSP_ASSIGNED',
            managementId: mgmt.id,
            scopeType: invite.scope === 'ALL' ? 'FULL' : 'SCOPED',
          },
        });

        // Create access grants for specific devices/locations
        if (invite.scope === 'SELECTED') {
          const grants: { membershipId: string; resourceType: 'DEVICE' | 'LOCATION'; resourceId: string }[] = [];
          for (const did of (invite.deviceIds as string[] || [])) {
            grants.push({ membershipId: newMembership.id, resourceType: 'DEVICE', resourceId: did });
          }
          for (const lid of (invite.locationIds as string[] || [])) {
            grants.push({ membershipId: newMembership.id, resourceType: 'LOCATION', resourceId: lid });
          }
          if (grants.length > 0) {
            await prisma.accessGrant.createMany({ data: grants, skipDuplicates: true });
          }
        }
      }
    }

    // Mark invitation as accepted
    await prisma.sharingInvitation.update({
      where: { id: invite.id },
      data: { status: 'ACCEPTED', acceptedByUserId: userId, acceptedAt: new Date() },
    });

    res.json({ success: true, managementId: mgmt.id });
  } catch (err) { next(err); }
});

// ── Revoke access ──
router.post('/revoke', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId;
    const userId = req.user!.userId;
    const { managementId } = req.body;
    if (!wsId || !managementId) { res.status(400).json({ error: 'Missing params' }); return; }

    const mgmt = await prisma.workspaceManagement.findUnique({ where: { id: managementId } });
    if (!mgmt) throw new AppError('Not found', 404);
    if (mgmt.mspWorkspaceId !== wsId && mgmt.companyWorkspaceId !== wsId) throw new AppError('No access', 403);

    await prisma.workspaceManagement.update({
      where: { id: managementId },
      data: { status: 'DETACHED', detachedAt: new Date(), detachedByUserId: userId, detachReason: 'Revoked by user' },
    });

    // Remove MSP memberships linked to this management
    await prisma.workspaceMembership.updateMany({
      where: { managementId },
      data: { status: 'REVOKED' },
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
