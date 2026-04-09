import { Request, Response, NextFunction } from 'express';
import {
  listDevices,
  getDeviceById,
  getDeviceByQrValue,
  createDevice,
  updateDevice,
  deleteDevice,
  generateDeviceQrCode,
} from './devices.service';
import { DeviceStatus, DeviceCriticality } from '@prisma/client';
import { deviceScopeFilter, isDeviceAccessible } from '../../middleware/workspace';

export async function getDevices(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { locationId, status, criticality, search, page, limit, clientWorkspaceId } = req.query as Record<string, string>;
    // MSP scope: include client workspaces
    const { getMspWorkspaceIds } = require('../../utils/mspScope');
    let wsIds: string[] = req.workspaceId ? await getMspWorkspaceIds(req.workspaceId) : [];
    // If clientWorkspaceId filter → narrow to that single workspace
    if (clientWorkspaceId && wsIds.includes(clientWorkspaceId)) {
      wsIds = [clientWorkspaceId];
    }
    const result = await listDevices({
      workspaceId: wsIds.length === 1 ? wsIds[0] : undefined,
      workspaceIds: wsIds.length > 1 ? wsIds : undefined,
      locationId,
      status: status as DeviceStatus | undefined,
      criticality: criticality as DeviceCriticality | undefined,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: Math.min(limit ? parseInt(limit, 10) : (wsIds.length > 1 ? 500 : 20), 500),
      scopeFilter: deviceScopeFilter(req.membership),
      requestingUser: req.user!,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // MSP: try current workspace first, then expand to client workspaces
    const { getMspWorkspaceIds } = require('../../utils/mspScope');
    const wsIds: string[] = req.workspaceId ? await getMspWorkspaceIds(req.workspaceId) : [req.workspaceId!];

    let device = null;
    for (const wsId of wsIds) {
      try {
        device = await getDeviceById(req.params.id, req.user!, wsId);
        if (device) break;
      } catch { /* not in this workspace — try next */ }
    }

    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    // Enforce scope on detail endpoint
    if (req.membership && !isDeviceAccessible(req.membership, device.id, device.locationId)) {
      res.status(403).json({ error: 'Device not in your access scope' });
      return;
    }

    res.status(200).json(device);
  } catch (err) {
    next(err);
  }
}

export async function getDeviceByQr(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const device = await getDeviceByQrValue(req.params.qrCodeValue);
    res.status(200).json(device);
  } catch (err) {
    next(err);
  }
}

export async function getDeviceQrCode(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const qrDataUrl = await generateDeviceQrCode(req.params.id, req.workspaceId!);
    res.status(200).json({ qrCode: qrDataUrl });
  } catch (err) {
    next(err);
  }
}

export async function postDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const device = await createDevice({ ...req.body, workspaceId: req.workspaceId! }, req.user!.userId);
    res.status(201).json(device);
  } catch (err) {
    next(err);
  }
}

export async function patchDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const device = await updateDevice(req.params.id, req.body, req.user!.userId, req.workspaceId!);
    res.status(200).json(device);
  } catch (err) {
    next(err);
  }
}

export async function removeDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deleteDevice(req.params.id, req.user!.userId, req.workspaceId!);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
