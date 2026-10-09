-- DropIndex
DROP INDEX "TrainingTopic_cohortId_weekNumber_key";

-- AlterTable
ALTER TABLE "TrainingEnrollment" ADD COLUMN     "track" TEXT NOT NULL DEFAULT 'new';

-- AlterTable
ALTER TABLE "TrainingTopic" ADD COLUMN     "day" TEXT NOT NULL DEFAULT 'Sunday',
ADD COLUMN     "endTime" TEXT,
ADD COLUMN     "requiredForNew" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "requiredForRefresher" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "startTime" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TrainingTopic_cohortId_weekNumber_startTime_key" ON "TrainingTopic"("cohortId", "weekNumber", "startTime");
