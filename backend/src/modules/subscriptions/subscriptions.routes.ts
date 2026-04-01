import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate);

// List my subscriptions
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subs = await prisma.subscription.findMany({
      where: { userId: req.user!.userId },
      orderBy: { name: 'asc' },
    });
    res.json(subs);
  } catch (err) { next(err); }
});

// Create
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sub = await prisma.subscription.create({
      data: {
        ...req.body,
        userId: req.user!.userId,
      },
    });
    res.status(201).json(sub);
  } catch (err) { next(err); }
});

// Update
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.subscription.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
    const { userId, id, ...safeData } = req.body;
    const sub = await prisma.subscription.update({
      where: { id: req.params.id },
      data: safeData,
    });
    res.json(sub);
  } catch (err) { next(err); }
});

// Delete
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.subscription.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
    await prisma.subscription.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

// ── Trusted Contacts ────────────────────────────────────

router.get('/trusted-contacts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contacts = await prisma.trustedContact.findMany({
      where: { userId: req.user!.userId },
    });
    res.json(contacts);
  } catch (err) { next(err); }
});

router.post('/trusted-contacts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contact = await prisma.trustedContact.create({
      data: {
        ...req.body,
        userId: req.user!.userId,
      },
    });
    res.status(201).json(contact);
  } catch (err) { next(err); }
});

router.patch('/trusted-contacts/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.trustedContact.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
    const { userId: _u, id: _i, ...safeContactData } = req.body;
    const contact = await prisma.trustedContact.update({
      where: { id: req.params.id },
      data: safeContactData,
    });
    res.json(contact);
  } catch (err) { next(err); }
});

router.delete('/trusted-contacts/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.trustedContact.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
    await prisma.trustedContact.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
