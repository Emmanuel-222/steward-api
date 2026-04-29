/*
  Warnings:

  - A unique constraint covering the columns `[userId,meetingId]` on the table `Attendance` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'Ongoing';

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_userId_meetingId_key" ON "Attendance"("userId", "meetingId");
