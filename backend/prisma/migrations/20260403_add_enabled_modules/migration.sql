ALTER TABLE "Workspace" ADD COLUMN "enabledModules" TEXT[] DEFAULT ARRAY['helpdesk']::TEXT[];

-- Set all existing workspaces to have helpdesk enabled
UPDATE "Workspace" SET "enabledModules" = ARRAY['helpdesk']::TEXT[] WHERE "enabledModules" IS NULL;
