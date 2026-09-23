CREATE TABLE "DevelopmentRequest" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "version" INTEGER NOT NULL DEFAULT 1,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "resolvedAt" TIMESTAMPTZ(3),
  "resolution" TEXT,
  "resolvedBy" TEXT,
  CONSTRAINT "DevelopmentRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DevelopmentRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DevelopmentRequest_status_check" CHECK ("status" IN ('OPEN', 'RESOLVED'))
);
CREATE UNIQUE INDEX "DevelopmentRequest_employeeId_key" ON "DevelopmentRequest"("employeeId");
CREATE INDEX "DevelopmentRequest_status_updatedAt_idx" ON "DevelopmentRequest"("status", "updatedAt");
