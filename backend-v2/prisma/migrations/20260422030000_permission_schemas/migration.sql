-- CreateTable
CREATE TABLE "PermissionSchema" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "overrides" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionSchema_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PermissionSchema_workspaceId_idx" ON "PermissionSchema"("workspaceId");

-- AddForeignKey
ALTER TABLE "PermissionSchema" ADD CONSTRAINT "PermissionSchema_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

