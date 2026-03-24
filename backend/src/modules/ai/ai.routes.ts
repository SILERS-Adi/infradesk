import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { parseVoice } from './ai.controller';
const router = Router();
router.post('/voice-parse', authenticate, parseVoice);
export default router;
