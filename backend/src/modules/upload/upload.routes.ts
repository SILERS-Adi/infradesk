import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { authenticate } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/workspace';

const UPLOADS_DIR = process.env.UPLOADS_DIR || '/app/uploads';

// Upewnij się że folder istnieje
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    // Crypto-random filename — unpredictable
    const name = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Dozwolone tylko PDF i obrazy'));
    }
  },
});

const router = Router();

// Upload file — returns both public URL (for logos) and secure URL (for attachments)
router.post('/', authenticate, upload.single('file'), (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Brak pliku' });
      return;
    }
    const publicUrl = `/uploads/${req.file.filename}`;
    const secureUrl = `/api/files/${req.file.filename}`;
    res.json({ url: publicUrl, secureUrl, filename: req.file.originalname, size: req.file.size });
  } catch (err) {
    next(err);
  }
});

export default router;

// Separate authenticated file download handler — mounted at /api/files in app.ts
export function secureFileDownload(uploadsDir: string) {
  const fileRouter = Router();
  fileRouter.get('/:filename', authenticate, requireWorkspace, (req: Request, res: Response) => {
    const filename = path.basename(req.params.filename); // prevent path traversal
    const filePath = path.join(uploadsDir, filename);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(filePath).pipe(res);
  });
  return fileRouter;
}
