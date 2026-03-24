import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { CreateAccessTypeInput, UpdateAccessTypeInput } from './accessTypes.validation';

export async function listAccessTypes() {
  return prisma.accessType.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
}

export async function createAccessType(data: CreateAccessTypeInput) {
  const slug = data.slug ?? data.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');
  return prisma.accessType.create({
    data: { name: data.name, slug, icon: data.icon, color: data.color, sortOrder: data.sortOrder ?? 99 },
  });
}

export async function updateAccessType(id: string, data: UpdateAccessTypeInput) {
  const existing = await prisma.accessType.findUnique({ where: { id } });
  if (!existing) throw new AppError('Not found', 404);
  return prisma.accessType.update({ where: { id }, data });
}

export async function deleteAccessType(id: string) {
  const existing = await prisma.accessType.findUnique({ where: { id } });
  if (!existing) throw new AppError('Not found', 404);
  if (existing.isSystem) throw new AppError('Cannot delete system type', 400);
  return prisma.accessType.delete({ where: { id } });
}

const SYSTEM_TYPES = [
  { name: 'RustDesk',   slug: 'rustdesk',  icon: '🖥️', color: '#e74c3c', sortOrder: 1,  isSystem: true },
  { name: 'Windows',    slug: 'windows',   icon: '🪟', color: '#0078d4', sortOrder: 2,  isSystem: true },
  { name: 'Veritum',    slug: 'veritum',   icon: '🔐', color: '#8e44ad', sortOrder: 3,  isSystem: true },
  { name: 'AnyDesk',    slug: 'anydesk',   icon: '🔗', color: '#ef6c00', sortOrder: 4,  isSystem: true },
  { name: 'Symfonia',   slug: 'symfonia',  icon: '📊', color: '#27ae60', sortOrder: 5,  isSystem: true },
  { name: 'E-Mail',     slug: 'email',     icon: '📧', color: '#2980b9', sortOrder: 6,  isSystem: true },
  { name: 'Google',     slug: 'google',    icon: '🔍', color: '#ea4335', sortOrder: 7,  isSystem: true },
  { name: 'Roger',      slug: 'roger',     icon: '🚪', color: '#1abc9c', sortOrder: 8,  isSystem: true },
  { name: 'Satel',      slug: 'satel',     icon: '🔒', color: '#e67e22', sortOrder: 9,  isSystem: true },
  { name: 'Office 365', slug: 'office365', icon: '📝', color: '#d83b01', sortOrder: 10, isSystem: true },
  { name: 'Insert',     slug: 'insert',    icon: '💼', color: '#2c3e50', sortOrder: 11, isSystem: true },
  { name: 'WF-Mag',     slug: 'wfmag',     icon: '📦', color: '#16a085', sortOrder: 12, isSystem: true },
  { name: 'SQL',        slug: 'sql',       icon: '🗄️', color: '#c0392b', sortOrder: 13, isSystem: true },
  { name: 'UniFi',      slug: 'unifi',     icon: '📡', color: '#006fff', sortOrder: 14, isSystem: true },
  { name: 'Ruijie',     slug: 'ruijie',    icon: '🌐', color: '#e74c3c', sortOrder: 15, isSystem: true },
  { name: 'Telefon',    slug: 'telefon',   icon: '📞', color: '#27ae60', sortOrder: 16, isSystem: true },
  { name: 'Płatnik',    slug: 'platnik',   icon: '💰', color: '#8e44ad', sortOrder: 17, isSystem: true },
  { name: 'Hosting',    slug: 'hosting',   icon: '☁️', color: '#2980b9', sortOrder: 18, isSystem: true },
];

export async function seedAccessTypes() {
  for (const t of SYSTEM_TYPES) {
    await prisma.accessType.upsert({
      where: { slug: t.slug },
      update: { name: t.name, icon: t.icon, color: t.color, sortOrder: t.sortOrder },
      create: t,
    });
  }
}
