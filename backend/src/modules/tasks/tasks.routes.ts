import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import * as ctrl from './tasks.controller';

const router = Router();

router.use(authenticate);

router.get('/', ctrl.listTasks);
router.get('/:id', ctrl.getTask);
router.post('/:id/status', ctrl.changeStatus);
router.patch('/:id', ctrl.updateTask);

export default router;
