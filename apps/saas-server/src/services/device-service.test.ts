import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createId, USER_SETTING_KEYS } from '@digital-shelf-saas/shared-types';
import { createEntitlementService } from '@digital-shelf-saas/billing';
import { createDeviceService } from './device-service.js';
import { createUserSettingsService } from './user-settings-service.js';
import { createTestUser } from '../test-support/user-fixtures.js';

const prisma = new PrismaClient();

describe('device-service tenant isolation', () => {
  const entitlement = createEntitlementService(prisma);
  const userSettings = createUserSettingsService(prisma, {});
  const deviceService = createDeviceService(prisma, {
    pairingEnabled: true,
    entitlement,
    userSettings,
  });

  beforeEach(async () => {
    await prisma.deviceConfig.deleteMany();
    await prisma.device.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedUserWithSub(steamSuffix: string) {
    const user = await createTestUser(prisma, { email: `${Date.now()}-${steamSuffix}@test.local` });
    await prisma.subscription.create({
      data: {
        id: createId('sub'),
        userId: user.id,
        planId: 'plan_pro',
        provider: 'paypal',
        status: 'active',
        billingCycle: 'monthly',
      },
    });
    return user;
  }

  it('user A cannot access user B device', async () => {
    const userA = await seedUserWithSub('01');
    const userB = await seedUserWithSub('02');

    const registered = await deviceService.register({
      hardwareId: `hw-${Date.now()}`,
    });
    await deviceService.claimByCode(userB.id, { claimCode: registered.claimCode! });

    await expect(deviceService.getDevice(userA.id, registered.deviceId)).rejects.toMatchObject({
      code: 'DEVICE_NOT_FOUND',
    });
  });

  it('claim assigns userId and seeds config from user defaults', async () => {
    const user = await seedUserWithSub('03');
    await userSettings.setSetting(user.id, USER_SETTING_KEYS.DISPLAY_GAMES_PER_FRAME, '5');

    const registered = await deviceService.register({
      hardwareId: `hw-claim-${Date.now()}`,
    });
    await deviceService.claimByCode(user.id, { claimCode: registered.claimCode! });

    const device = await prisma.device.findUniqueOrThrow({ where: { id: registered.deviceId } });
    expect(device.userId).toBe(user.id);
    expect(device.tokenHash.length).toBeGreaterThan(0);

    const config = await prisma.deviceConfig.findUniqueOrThrow({
      where: { deviceId: registered.deviceId },
    });
    expect(config.gamesPerFrame).toBe(5);
  });

  it('rejects claim when supplied deviceId does not match claim code device', async () => {
    const user = await seedUserWithSub('05');
    const first = await deviceService.register({
      hardwareId: `hw-claim-match-1-${Date.now()}`,
    });
    const second = await deviceService.register({
      hardwareId: `hw-claim-match-2-${Date.now()}`,
    });

    await expect(
      deviceService.claimByCode(user.id, {
        deviceId: second.deviceId,
        claimCode: first.claimCode!,
      }),
    ).rejects.toMatchObject({ code: 'DEVICE_NOT_FOUND' });

    const firstDevice = await prisma.device.findUniqueOrThrow({ where: { id: first.deviceId } });
    expect(firstDevice.userId).toBeNull();
    expect(firstDevice.tokenHash).toBe('');
  });

  it('blocks claim when device limit reached', async () => {
    const user = await seedUserWithSub('04');
    await prisma.subscription.update({
      where: { userId: user.id },
      data: { planId: 'plan_basic' },
    });

    const first = await deviceService.register({ hardwareId: `hw-limit-1-${Date.now()}` });
    await deviceService.claimByCode(user.id, { claimCode: first.claimCode! });

    const second = await deviceService.register({ hardwareId: `hw-limit-2-${Date.now()}` });
    await expect(
      deviceService.claimByCode(user.id, { claimCode: second.claimCode! }),
    ).rejects.toMatchObject({ code: 'DEVICE_LIMIT_REACHED' });
  });
});
