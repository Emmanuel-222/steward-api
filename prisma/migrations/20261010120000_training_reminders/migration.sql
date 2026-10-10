-- CreateTable
CREATE TABLE "TrainingReminderSent" (
    "id" SERIAL NOT NULL,
    "classId" INTEGER NOT NULL,
    "offset" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingReminderSent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainingReminderSent_classId_offset_key" ON "TrainingReminderSent"("classId", "offset");

-- AddForeignKey
ALTER TABLE "TrainingReminderSent" ADD CONSTRAINT "TrainingReminderSent_classId_fkey" FOREIGN KEY ("classId") REFERENCES "TrainingClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
