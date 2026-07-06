import type { PrismaClient } from '@prisma/client';
import {
  DEFAULT_DEVICE_CONFIG,
  createId,
  type DeviceConfig,
} from '@digital-shelf-saas/shared-types';
import type {
  AdminClaimResponse,
  AdminDeviceListItem,
  AdminDevicePatch,
  ClaimStatusResponse,
  HeartbeatRequest,
  RegisterRequest,
  RegisterResponse,
} from '@digital-shelf-saas/device-protocol';
import type { EntitlementService } from '@digital-shelf-saas/billing';
import { generateDeviceToken, hashDeviceToken, isDeviceClaimed } from '../lib/device-auth.js';
import type { UserSettingsService } from './user-settings-service.js';

export class DeviceServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'DeviceServiceError';
  }
}

export interface DeviceServiceDeps {
  pairingEnabled: boolean;
  now?: () => Date;
  entitlement?: EntitlementService;
  userSettings?: UserSettingsService;
}

function generateClaimCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function toDeviceStatus(tokenHash: string): 'pending' | 'claimed' {
  return isDeviceClaimed(tokenHash) ? 'claimed' : 'pending';
}

function toAdminListItem(device: {
  id: string;
  name: string;
  hardwareId: string;
  tokenHash: string;
  screenWidth: number;
  screenHeight: number;
  firmwareVersion: string | null;
  lastSeenAt: Date | null;
  lastWifiRssi: number | null;
  lastFrameId: string | null;
  createdAt: Date;
}): AdminDeviceListItem {
  return {
    id: device.id,
    name: device.name,
    hardwareId: device.hardwareId,
    status: toDeviceStatus(device.tokenHash),
    isPreview: false,
    screenWidth: device.screenWidth,
    screenHeight: device.screenHeight,
    firmwareVersion: device.firmwareVersion,
    lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    lastWifiRssi: device.lastWifiRssi,
    lastFrameId: device.lastFrameId,
    createdAt: device.createdAt.toISOString(),
  };
}

async function generateUniqueClaimCode(prisma: PrismaClient): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const claimCode = generateClaimCode();
    const existing = await prisma.device.findFirst({ where: { claimCode } });
    if (!existing) return claimCode;
  }
  throw new DeviceServiceError('INTERNAL_ERROR', 'Failed to generate unique claim code.', 500);
}

function assertOwned(
  device: { userId: string | null } | null,
  userId: string,
): asserts device is { userId: string } {
  if (!device || device.userId !== userId) {
    throw new DeviceServiceError('DEVICE_NOT_FOUND', 'Device not found.', 404);
  }
}

export function createDeviceService(prisma: PrismaClient, deps: DeviceServiceDeps) {
  const now = deps.now ?? (() => new Date());

  async function register(input: RegisterRequest): Promise<RegisterResponse> {
    if (!deps.pairingEnabled) {
      throw new DeviceServiceError('PAIRING_DISABLED', 'Device pairing is disabled.', 403);
    }

    const screenWidth = input.screenWidth ?? 172;
    const screenHeight = input.screenHeight ?? 320;
    const name = input.deviceName ?? 'Digital Shelf';

    if (input.deviceId) {
      const byId = await prisma.device.findUnique({ where: { id: input.deviceId } });
      if (byId) {
        if (byId.hardwareId !== input.hardwareId) {
          throw new DeviceServiceError(
            'DEVICE_ID_HARDWARE_MISMATCH',
            'Device ID does not match hardware ID.',
            409,
          );
        }
        await prisma.device.update({
          where: { id: byId.id },
          data: {
            firmwareVersion: input.firmwareVersion ?? byId.firmwareVersion,
            screenWidth,
            screenHeight,
            name,
          },
        });
        const status = toDeviceStatus(byId.tokenHash);
        return {
          deviceId: byId.id,
          status,
          claimCode: status === 'pending' ? (byId.claimCode ?? undefined) : undefined,
        };
      }
    }

    const byHardware = await prisma.device.findUnique({ where: { hardwareId: input.hardwareId } });
    if (byHardware) {
      await prisma.device.update({
        where: { id: byHardware.id },
        data: {
          firmwareVersion: input.firmwareVersion ?? byHardware.firmwareVersion,
          screenWidth,
          screenHeight,
          name,
        },
      });
      const status = toDeviceStatus(byHardware.tokenHash);
      return {
        deviceId: byHardware.id,
        status,
        claimCode: status === 'pending' ? (byHardware.claimCode ?? undefined) : undefined,
      };
    }

    const deviceId = createId('device');
    const claimCode = await generateUniqueClaimCode(prisma);

    await prisma.device.create({
      data: {
        id: deviceId,
        name,
        hardwareId: input.hardwareId,
        tokenHash: '',
        claimCode,
        claimCodeExpiresAt: null,
        screenWidth,
        screenHeight,
        firmwareVersion: input.firmwareVersion,
      },
    });

    await prisma.deviceConfig.create({
      data: {
        deviceId,
        gamesPerFrame: DEFAULT_DEVICE_CONFIG.gamesPerFrame,
        rotationIntervalSeconds: DEFAULT_DEVICE_CONFIG.rotationIntervalSeconds,
        selectionMode: DEFAULT_DEVICE_CONFIG.selectionMode,
        showPublisher: DEFAULT_DEVICE_CONFIG.showPublisher,
        showPlaytime: DEFAULT_DEVICE_CONFIG.showPlaytime,
        avoidRecentRepeats: DEFAULT_DEVICE_CONFIG.avoidRecentRepeats,
      },
    });

    return { deviceId, claimCode, status: 'pending' };
  }

  async function getClaimStatus(input: {
    deviceId: string;
    hardwareId: string;
  }): Promise<ClaimStatusResponse> {
    const device = await prisma.device.findUnique({ where: { id: input.deviceId } });
    if (!device) {
      throw new DeviceServiceError('DEVICE_NOT_FOUND', 'Device not found.', 404);
    }
    if (device.hardwareId !== input.hardwareId) {
      throw new DeviceServiceError('HARDWARE_MISMATCH', 'Hardware ID mismatch.', 403);
    }

    const status = toDeviceStatus(device.tokenHash);
    if (status === 'pending') {
      return { status, claimCode: device.claimCode ?? undefined };
    }

    if (device.pendingToken) {
      const token = device.pendingToken;
      await prisma.device.update({
        where: { id: device.id },
        data: { pendingToken: null },
      });
      return { status: 'claimed', token };
    }

    return { status: 'claimed' };
  }

  async function claimByCode(
    userId: string,
    input: { deviceId?: string; claimCode: string; name?: string },
  ): Promise<AdminClaimResponse> {
    if (!deps.pairingEnabled) {
      throw new DeviceServiceError('PAIRING_DISABLED', 'Device pairing is disabled.', 403);
    }

    if (deps.entitlement) {
      const canClaim = await deps.entitlement.canClaimDevice(userId);
      if (!canClaim) {
        throw new DeviceServiceError(
          'DEVICE_LIMIT_REACHED',
          'Device limit reached for current plan.',
          403,
        );
      }
    }

    const device = await prisma.device.findFirst({ where: { claimCode: input.claimCode } });
    if (!device) {
      throw new DeviceServiceError('CLAIM_CODE_NOT_FOUND', 'Claim code not found.', 404);
    }
    if (input.deviceId && device.id !== input.deviceId) {
      throw new DeviceServiceError('DEVICE_NOT_FOUND', 'Device not found.', 404);
    }
    if (device.userId && device.userId !== userId) {
      throw new DeviceServiceError('DEVICE_ALREADY_CLAIMED', 'Device is already claimed.', 409);
    }
    if (isDeviceClaimed(device.tokenHash)) {
      throw new DeviceServiceError('DEVICE_ALREADY_CLAIMED', 'Device is already claimed.', 409);
    }

    const token = generateDeviceToken();
    const tokenHash = hashDeviceToken(token);
    const name = input.name ?? device.name;

    if (deps.userSettings) {
      const defaults = await deps.userSettings.resolveDisplayDefaults(userId);
      await prisma.deviceConfig.update({
        where: { deviceId: device.id },
        data: {
          gamesPerFrame: defaults.gamesPerFrame,
          rotationIntervalSeconds: defaults.rotationIntervalSeconds,
          selectionMode: defaults.selectionMode,
          showPublisher: defaults.showPublisher,
          showPlaytime: defaults.showPlaytime,
          avoidRecentRepeats: defaults.avoidRecentRepeats,
        },
      });
    }

    await prisma.device.update({
      where: { id: device.id },
      data: {
        userId,
        name,
        tokenHash,
        pendingToken: token,
        claimCode: null,
      },
    });

    return {
      deviceId: device.id,
      name,
      status: 'claimed',
      tokenPendingDelivery: true,
    };
  }

  async function recordHeartbeat(deviceId: string, input: HeartbeatRequest): Promise<void> {
    await prisma.device.update({
      where: { id: deviceId },
      data: {
        lastSeenAt: now(),
        firmwareVersion: input.firmwareVersion,
        lastWifiRssi: input.wifiRssi,
        lastFreeHeap: input.freeHeap,
        lastFrameId: input.currentFrameId,
      },
    });
  }

  async function getConfig(deviceId: string): Promise<Omit<DeviceConfig, 'deviceId' | 'updatedAt'>> {
    const config = await prisma.deviceConfig.findUnique({ where: { deviceId } });
    if (!config) {
      throw new DeviceServiceError('DEVICE_NOT_FOUND', 'Device config not found.', 404);
    }
    return {
      gamesPerFrame: config.gamesPerFrame as DeviceConfig['gamesPerFrame'],
      rotationIntervalSeconds: config.rotationIntervalSeconds,
      selectionMode: config.selectionMode as DeviceConfig['selectionMode'],
      showPublisher: config.showPublisher,
      showPlaytime: config.showPlaytime,
      avoidRecentRepeats: config.avoidRecentRepeats,
    };
  }

  async function listDevices(userId: string): Promise<AdminDeviceListItem[]> {
    const devices = await prisma.device.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return devices.map((d) => toAdminListItem(d));
  }

  async function getDevice(userId: string, deviceId: string) {
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: { config: true },
    });
    assertOwned(device, userId);

    return {
      ...toAdminListItem(device),
      config: device.config
        ? {
            deviceId: device.config.deviceId,
            gamesPerFrame: device.config.gamesPerFrame as DeviceConfig['gamesPerFrame'],
            rotationIntervalSeconds: device.config.rotationIntervalSeconds,
            selectionMode: device.config.selectionMode as DeviceConfig['selectionMode'],
            showPublisher: device.config.showPublisher,
            showPlaytime: device.config.showPlaytime,
            avoidRecentRepeats: device.config.avoidRecentRepeats,
            updatedAt: device.config.updatedAt.toISOString(),
          }
        : null,
    };
  }

  async function updateDevice(userId: string, deviceId: string, patch: AdminDevicePatch) {
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    assertOwned(device, userId);

    if (patch.name) {
      await prisma.device.update({ where: { id: deviceId }, data: { name: patch.name } });
    }

    if (patch.config) {
      await prisma.deviceConfig.update({ where: { deviceId }, data: patch.config });
    }

    return getDevice(userId, deviceId);
  }

  async function deleteDevice(userId: string, deviceId: string): Promise<{ deleted: true; deviceId: string }> {
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    assertOwned(device, userId);
    await prisma.device.delete({ where: { id: deviceId } });
    return { deleted: true, deviceId };
  }

  async function verifyFrameOwnership(frameId: string, deviceId: string, userId?: string): Promise<boolean> {
    const frame = await prisma.displayFrame.findUnique({
      where: { id: frameId },
      include: { device: true },
    });
    if (!frame || frame.deviceId !== deviceId) return false;
    if (userId && frame.device.userId !== userId) return false;
    return true;
  }

  return {
    register,
    getClaimStatus,
    claimByCode,
    recordHeartbeat,
    getConfig,
    listDevices,
    getDevice,
    updateDevice,
    deleteDevice,
    verifyFrameOwnership,
  };
}

export type DeviceService = ReturnType<typeof createDeviceService>;
