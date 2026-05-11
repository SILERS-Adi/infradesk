import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';

const router = Router();
router.use(requireAuth, requireWorkspace);

// Stub: realny moduł powiadomień jeszcze nie istnieje. Frontend (Topbar) pyta
// żeby pokazać kropkę przy dzwonku — zwracamy 0, aż dorobimy model+integracje.
router.get('/unread', (_req, res) => {
  res.json({ unread: 0 });
});

export default router;
