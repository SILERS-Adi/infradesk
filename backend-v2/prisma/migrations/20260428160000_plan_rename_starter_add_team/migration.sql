-- Plan enum: rename STARTER -> START, add TEAM tier between START and PRO.
-- Non-destructive: existing rows with plan='STARTER' automatically map to plan='START'.
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block in older Postgres,
-- but Prisma migrate runs each statement separately so this is safe.

ALTER TYPE "Plan" RENAME VALUE 'STARTER' TO 'START';

-- Position TEAM between START and PRO so the enum order matches PLAN_ORDER.
ALTER TYPE "Plan" ADD VALUE 'TEAM' BEFORE 'PRO';
