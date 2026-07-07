/*
  Warnings:

  - Added the required column `title` to the `Meeting` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "title" TEXT NOT NULL;
