import { Request, Response, NextFunction } from 'express';
import * as service from './invoicing.service';
import { createDocumentSchema, updateDocumentSchema } from './invoicing.validation';

export async function listDocuments(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, type, search, page, per_page } = req.query as Record<string, string>;
    const result = await service.listDocuments({
      workspaceId: req.workspaceId!,
      status,
      type,
      search,
      page: page ? parseInt(page) : 1,
      perPage: per_page ? parseInt(per_page) : 50,
    });
    res.json(result);
  } catch (err) { next(err); }
}

export async function getDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const doc = await service.getDocument(req.params.id, req.workspaceId!);
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }
    res.json(doc);
  } catch (err) { next(err); }
}

export async function createDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createDocumentSchema.parse(req.body);
    const doc = await service.createDocument(data, req.workspaceId!, req.user!.userId);
    res.status(201).json(doc);
  } catch (err) { next(err); }
}

export async function updateDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateDocumentSchema.parse(req.body);
    const doc = await service.updateDocument(req.params.id, data, req.workspaceId!);
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }
    res.json(doc);
  } catch (err) { next(err); }
}

export async function deleteDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const ok = await service.deleteDocument(req.params.id, req.workspaceId!);
    if (!ok) return res.status(404).json({ error: 'Document not found' });
    res.status(204).send();
  } catch (err) { next(err); }
}
