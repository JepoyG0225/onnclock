-- CreateTable: configurable approval workflows (engine v3)
CREATE TABLE "approval_workflows" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ordered steps belonging to a workflow
CREATE TABLE "approval_workflow_steps" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "stepType" TEXT NOT NULL DEFAULT 'APPROVAL',
    "conditions" JSONB,
    "approverType" TEXT,
    "approverUserId" TEXT,
    "approverRole" TEXT,
    "notifyTarget" TEXT,
    "notifyUserId" TEXT,
    "notifyRole" TEXT,
    "notifyChannel" TEXT DEFAULT 'IN_APP',
    "messageTitle" TEXT,
    "messageBody" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_workflows_companyId_type_idx" ON "approval_workflows"("companyId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "approval_workflows_companyId_type_departmentId_key" ON "approval_workflows"("companyId", "type", "departmentId");

-- CreateIndex
CREATE INDEX "approval_workflow_steps_workflowId_idx" ON "approval_workflow_steps"("workflowId");

-- CreateIndex
CREATE UNIQUE INDEX "approval_workflow_steps_workflowId_order_key" ON "approval_workflow_steps"("workflowId", "order");

-- AddForeignKey
ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_workflow_steps" ADD CONSTRAINT "approval_workflow_steps_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "approval_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
