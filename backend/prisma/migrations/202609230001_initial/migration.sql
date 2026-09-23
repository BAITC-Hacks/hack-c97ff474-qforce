-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "employeeId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessionalRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "translations" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ProfessionalRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grade" (
    "roleId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "translations" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Grade_pkey" PRIMARY KEY ("roleId","id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "translations" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "sourceHash" TEXT NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleGradeRequirement" (
    "roleId" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "requiredLevel" DOUBLE PRECISION NOT NULL,
    "critical" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RoleGradeRequirement_pkey" PRIMARY KEY ("roleId","gradeId","skillId")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "managerId" TEXT,
    "hireDate" DATE NOT NULL,
    "tenureMonths" INTEGER NOT NULL,
    "workFormat" TEXT NOT NULL,
    "preferredLanguage" TEXT NOT NULL,
    "careerGoal" JSONB,
    "lastReviewDate" DATE NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDevelopmentState" (
    "employeeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "historyVersion" INTEGER NOT NULL DEFAULT 1,
    "feedbackVersion" INTEGER NOT NULL DEFAULT 1,
    "onlineVersion" INTEGER NOT NULL DEFAULT 0,
    "baselineHash" TEXT NOT NULL,
    "baselineLevels" JSONB NOT NULL,
    "baselineDate" DATE NOT NULL,
    "missingSkillLevel" DOUBLE PRECISION,

    CONSTRAINT "EmployeeDevelopmentState_pkey" PRIMARY KEY ("employeeId")
);

-- CreateTable
CREATE TABLE "EmployeeSkill" (
    "employeeId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "level" DOUBLE PRECISION,

    CONSTRAINT "EmployeeSkill_pkey" PRIMARY KEY ("employeeId","skillId")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "durationHours" DOUBLE PRECISION NOT NULL,
    "mandatory" BOOLEAN NOT NULL,
    "repeatable" BOOLEAN NOT NULL DEFAULT false,
    "translations" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "sourceHash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityRole" (
    "activityId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "ActivityRole_pkey" PRIMARY KEY ("activityId","roleId")
);

-- CreateTable
CREATE TABLE "ActivityGrade" (
    "activityId" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,

    CONSTRAINT "ActivityGrade_pkey" PRIMARY KEY ("activityId","gradeId")
);

-- CreateTable
CREATE TABLE "ActivitySkillEffect" (
    "activityId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "gain" DOUBLE PRECISION NOT NULL,
    "maxLevel" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ActivitySkillEffect_pkey" PRIMARY KEY ("activityId","skillId")
);

-- CreateTable
CREATE TABLE "ActivityPrerequisite" (
    "activityId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "requiredLevel" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ActivityPrerequisite_pkey" PRIMARY KEY ("activityId","skillId")
);

-- CreateTable
CREATE TABLE "ActivitySession" (
    "activityId" TEXT NOT NULL,
    "date" DATE NOT NULL,

    CONSTRAINT "ActivitySession_pkey" PRIMARY KEY ("activityId","date")
);

-- CreateTable
CREATE TABLE "Participation" (
    "id" TEXT NOT NULL,
    "sourceRecordId" TEXT,
    "employeeId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "occurrenceKey" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dueDate" DATE,
    "status" TEXT NOT NULL,
    "completionPct" INTEGER NOT NULL,
    "score" INTEGER,
    "feedbackRating" INTEGER,
    "assignedBy" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "actorId" TEXT,
    "gainApplied" BOOLEAN NOT NULL DEFAULT false,
    "completionResult" JSONB,
    "sourceHash" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Participation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillChange" (
    "id" TEXT NOT NULL,
    "participationId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "beforeLevel" DOUBLE PRECISION NOT NULL,
    "afterLevel" DOUBLE PRECISION NOT NULL,
    "actualGain" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "rule" JSONB NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationSet" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "generatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locale" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "model" TEXT,
    "promptVersion" TEXT NOT NULL,
    "rankingVersion" TEXT NOT NULL,
    "contextVersion" JSONB NOT NULL,
    "contextSnapshot" JSONB NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "status" TEXT NOT NULL,
    "diagnostics" JSONB NOT NULL,

    CONSTRAINT "RecommendationSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationItem" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "explanation" TEXT NOT NULL,
    "factors" JSONB NOT NULL,
    "expectedSkillChanges" JSONB NOT NULL,
    "expectedReadinessDelta" DOUBLE PRECISION,

    CONSTRAINT "RecommendationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationFeedback" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "activityId" TEXT,
    "rating" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "dryRun" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    "fileHashes" JSONB NOT NULL,
    "report" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "actorId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("actorId","operation","key")
);

-- CreateTable
CREATE TABLE "CatalogVersion" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "version" INTEGER NOT NULL DEFAULT 1,
    "asOfDate" DATE NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "CatalogVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Grade_roleId_position_key" ON "Grade"("roleId", "position");

-- CreateIndex
CREATE INDEX "Employee_roleId_gradeId_department_idx" ON "Employee"("roleId", "gradeId", "department");

-- CreateIndex
CREATE INDEX "Activity_type_format_mandatory_idx" ON "Activity"("type", "format", "mandatory");

-- CreateIndex
CREATE UNIQUE INDEX "Participation_sourceRecordId_key" ON "Participation"("sourceRecordId");

-- CreateIndex
CREATE INDEX "Participation_employeeId_date_idx" ON "Participation"("employeeId", "date");

-- CreateIndex
CREATE INDEX "Participation_activityId_status_date_idx" ON "Participation"("activityId", "status", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Participation_employeeId_activityId_occurrenceKey_key" ON "Participation"("employeeId", "activityId", "occurrenceKey");

-- CreateIndex
CREATE UNIQUE INDEX "SkillChange_participationId_skillId_key" ON "SkillChange"("participationId", "skillId");

-- CreateIndex
CREATE INDEX "RecommendationSet_employeeId_generatedAt_idx" ON "RecommendationSet"("employeeId", "generatedAt");

-- CreateIndex
CREATE INDEX "RecommendationSet_cacheKey_idx" ON "RecommendationSet"("cacheKey");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationItem_setId_rank_key" ON "RecommendationItem"("setId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationItem_setId_activityId_key" ON "RecommendationItem"("setId", "activityId");

-- CreateIndex
CREATE INDEX "RecommendationFeedback_employeeId_createdAt_idx" ON "RecommendationFeedback"("employeeId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "ProfessionalRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleGradeRequirement" ADD CONSTRAINT "RoleGradeRequirement_roleId_gradeId_fkey" FOREIGN KEY ("roleId", "gradeId") REFERENCES "Grade"("roleId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleGradeRequirement" ADD CONSTRAINT "RoleGradeRequirement_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "ProfessionalRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_roleId_gradeId_fkey" FOREIGN KEY ("roleId", "gradeId") REFERENCES "Grade"("roleId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDevelopmentState" ADD CONSTRAINT "EmployeeDevelopmentState_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSkill" ADD CONSTRAINT "EmployeeSkill_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSkill" ADD CONSTRAINT "EmployeeSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityRole" ADD CONSTRAINT "ActivityRole_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityRole" ADD CONSTRAINT "ActivityRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "ProfessionalRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityGrade" ADD CONSTRAINT "ActivityGrade_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySkillEffect" ADD CONSTRAINT "ActivitySkillEffect_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySkillEffect" ADD CONSTRAINT "ActivitySkillEffect_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityPrerequisite" ADD CONSTRAINT "ActivityPrerequisite_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityPrerequisite" ADD CONSTRAINT "ActivityPrerequisite_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySession" ADD CONSTRAINT "ActivitySession_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participation" ADD CONSTRAINT "Participation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participation" ADD CONSTRAINT "Participation_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillChange" ADD CONSTRAINT "SkillChange_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "Participation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillChange" ADD CONSTRAINT "SkillChange_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationSet" ADD CONSTRAINT "RecommendationSet_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationItem" ADD CONSTRAINT "RecommendationItem_setId_fkey" FOREIGN KEY ("setId") REFERENCES "RecommendationSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationItem" ADD CONSTRAINT "RecommendationItem_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationFeedback" ADD CONSTRAINT "RecommendationFeedback_setId_fkey" FOREIGN KEY ("setId") REFERENCES "RecommendationSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationFeedback" ADD CONSTRAINT "RecommendationFeedback_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

