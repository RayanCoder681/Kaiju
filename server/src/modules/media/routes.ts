import { Router } from 'express';
import multer from 'multer';
import { config } from '../../config.js';
import { handle } from '../../middleware/handle.js';
import { requireHost } from '../../middleware/requireHost.js';
import { saveImage, getMedia } from './service.js';

// Stockage en mémoire : on valide le type réel avant d'écrire sur disque.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.limits.maxImageBytes },
});

/** Upload d'image (host uniquement). Monté sur /api/media. */
export const mediaUploadRouter = Router();
mediaUploadRouter.use(requireHost);

mediaUploadRouter.post(
  '/',
  upload.single('image'),
  handle((req, res) => {
    const file = (req as unknown as { file?: { buffer: Buffer } }).file;
    if (!file) {
      res.status(400).json({ ok: false, errorKey: 'error.validation' });
      return;
    }
    try {
      const record = saveImage(file.buffer);
      res.status(201).json({ ok: true, media: record, url: `/api/media/${record.id}` });
    } catch (err) {
      const msg = (err as Error).message;
      const errorKey = msg === 'IMAGE_TOO_LARGE' || msg === 'IMAGE_TYPE_INVALID' ? 'error.validation' : 'error.internal';
      res.status(400).json({ ok: false, errorKey });
    }
  }),
);

/** Lecture d'image — PUBLIC (affichée aux participants/projection). */
export const mediaPublicRouter = Router();
mediaPublicRouter.get(
  '/:id',
  handle((req, res) => {
    const media = getMedia(req.params.id);
    if (!media) {
      res.status(404).json({ ok: false, errorKey: 'error.codeInvalid' });
      return;
    }
    res.setHeader('Content-Type', media.mime);
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(media.path);
  }),
);
