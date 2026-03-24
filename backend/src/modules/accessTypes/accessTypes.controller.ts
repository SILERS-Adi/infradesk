import { Request, Response, NextFunction } from 'express';
import { listAccessTypes, createAccessType, updateAccessType, deleteAccessType } from './accessTypes.service';

export async function getAccessTypes(req: Request, res: Response, next: NextFunction) {
  try { res.json(await listAccessTypes()); } catch (e) { next(e); }
}
export async function postAccessType(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await createAccessType(req.body)); } catch (e) { next(e); }
}
export async function patchAccessType(req: Request, res: Response, next: NextFunction) {
  try { res.json(await updateAccessType(req.params.id, req.body)); } catch (e) { next(e); }
}
export async function removeAccessType(req: Request, res: Response, next: NextFunction) {
  try { await deleteAccessType(req.params.id); res.status(204).send(); } catch (e) { next(e); }
}
