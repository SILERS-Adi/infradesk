import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { parseVoice, suggestSolution } from './ai.controller';
const router = Router();
router.post('/voice-parse', authenticate, parseVoice);
router.post('/suggest', authenticate, suggestSolution);
export default router;
