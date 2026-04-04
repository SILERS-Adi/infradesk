import { z } from 'zod';

const menuGroupSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().max(100).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  items: z.array(z.string().max(100)).max(100),
  isCustom: z.boolean().optional(),
  isSeparator: z.boolean().optional(),
});

export const menuLayoutSchema = z.object({
  version: z.literal(1),
  groups: z.array(menuGroupSchema).max(50),
  hiddenItems: z.array(z.string().max(100)).max(200),
  collapsedGroups: z.array(z.string().max(100)).max(50),
  favoriteItems: z.array(z.string().max(100)).max(50).optional().default([]),
});
