-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "replacedBy" TEXT,
ADD COLUMN     "revokedAt" TIMESTAMP(3);
