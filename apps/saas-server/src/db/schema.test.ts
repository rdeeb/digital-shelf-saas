import { describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

describe('prisma schema', () => {
  it('can query users model', async () => {
    const prisma = new PrismaClient();
    const count = await prisma.user.count();
    expect(count).toBeGreaterThanOrEqual(0);
    await prisma.$disconnect();
  });
});
