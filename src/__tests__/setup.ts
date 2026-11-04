import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock Prisma client
vi.mock("@/lib/prisma", () => ({
  prisma: {
    brief: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    source: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    activity: {
      create: vi.fn(),
    },
    appSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));
