/*
  Warnings:

  - Added the required column `location` to the `Meeting` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "location" TEXT NOT NULL;
