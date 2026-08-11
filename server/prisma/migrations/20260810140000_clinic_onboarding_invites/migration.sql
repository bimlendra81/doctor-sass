-- AlterTable
ALTER TABLE `user` ADD COLUMN `inviteTokenExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `inviteTokenHash` VARCHAR(191) NULL,
    MODIFY `passwordHash` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_inviteTokenHash_key` ON `User`(`inviteTokenHash`);