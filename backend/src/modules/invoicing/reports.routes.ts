import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import * as reportsService from './reports.service';

const router = Router();
router.use(authenticate);

router.get('/sales', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await reportsService.getSalesReport(req.workspaceId!));
  } catch (err) { next(err); }
});

export default router;
