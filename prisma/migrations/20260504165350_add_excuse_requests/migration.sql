-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "excuseRequestId" INTEGER;

-- CreateTable
CREATE TABLE "ExcuseRequest" (
    "id" SERIAL NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "adminComment" TEXT,
    "stewardId" INTEGER NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExcuseRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_excuseRequestId_fkey" FOREIGN KEY ("excuseRequestId") REFERENCES "ExcuseRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExcuseRequest" ADD CONSTRAINT "ExcuseRequest_stewardId_fkey" FOREIGN KEY ("stewardId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExcuseRequest" ADD CONSTRAINT "ExcuseRequest_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
