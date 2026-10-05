-- DropForeignKey
ALTER TABLE "TrainingCohort" DROP CONSTRAINT "TrainingCohort_teacherId_fkey";

-- AlterTable
ALTER TABLE "TrainingCohort" DROP COLUMN "teacherId";

-- AlterTable
ALTER TABLE "TrainingTopic" ADD COLUMN     "teacherId" INTEGER;

-- AddForeignKey
ALTER TABLE "TrainingTopic" ADD CONSTRAINT "TrainingTopic_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
