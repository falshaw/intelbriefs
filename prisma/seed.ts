/**
 * IntelBriefs - Personal Intelligence Briefing
 * Copyright (c) 2024-2026 Nick Falshaw
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function generateSecurePassword(): string {
  return crypto.randomBytes(16).toString("base64url");
}

async function main() {
  console.log("Starting seed...");

  const adminPassword =
    process.env.SEED_ADMIN_PASSWORD || generateSecurePassword();
  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  console.log("\n========================================");
  console.log("Admin user credentials:");
  console.log("  Email:    default@intelbriefs.local");
  console.log(`  Password: ${adminPassword}`);
  console.log("========================================\n");
  console.log("Save this password! It will not be shown again.\n");

  const user = await prisma.user.upsert({
    where: { email: "default@intelbriefs.local" },
    update: {
      passwordHash: hashedPassword,
      role: "ADMIN",
      isActive: true,
    },
    create: {
      email: "default@intelbriefs.local",
      passwordHash: hashedPassword,
      name: "IntelBriefs Admin",
      role: "ADMIN",
      isActive: true,
    },
  });

  console.log("User created:", user.email);

  // Create default settings
  await prisma.appSettings.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      backgroundProfile: "",
      defaultMode: "QUICK",
      localScanPaths: ["docs/", "notes/"],
    },
  });

  console.log("Default settings created");
  console.log("\nSeed completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
