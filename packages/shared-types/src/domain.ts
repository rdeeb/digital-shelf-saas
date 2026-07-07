import type {
  FrameFormat,
  GamePlatform,
  GamesPerFrame,
  SelectionMode,
  SyncRunStatus,
} from './enums.js';

export interface Game {
  id: string;
  platform: GamePlatform;
  externalId: string;
  name: string;
  developers: string[];
  publishers: string[];
  capsuleUrl?: string | null;
  headerImageUrl?: string | null;
  metadataJson?: unknown;
  metadataUpdatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserGame {
  id: string;
  gameId: string;
  platformAccountId: string;
  playtimeMinutes?: number | null;
  hidden: boolean;
  favorite: boolean;
  lastDisplayedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Device {
  id: string;
  name: string;
  tokenHash: string;
  hardwareId: string;
  claimCode?: string | null;
  claimCodeExpiresAt?: Date | null;
  screenWidth: number;
  screenHeight: number;
  firmwareVersion?: string | null;
  lastSeenAt?: Date | null;
  lastWifiRssi?: number | null;
  lastFreeHeap?: number | null;
  lastFrameId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceConfig {
  deviceId: string;
  gamesPerFrame: GamesPerFrame;
  rotationIntervalSeconds: number;
  selectionMode: SelectionMode;
  showPublisher: boolean;
  showPlaytime: boolean;
  avoidRecentRepeats: boolean;
  updatedAt: Date;
}

export interface DisplayFrame {
  id: string;
  deviceId: string;
  format: FrameFormat;
  width: number;
  height: number;
  storagePath: string;
  gameIds: string[];
  generatedAt: Date;
  createdAt: Date;
}

export interface PlatformAccount {
  id: string;
  platform: GamePlatform;
  externalId: string;
  displayName?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SyncRun {
  id: string;
  platformAccountId: string;
  status: SyncRunStatus;
  startedAt: Date;
  completedAt?: Date | null;
  gamesDiscovered?: number | null;
  gamesAdded?: number | null;
  gamesUpdated?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: Date;
}

export interface Setting {
  key: string;
  value: string;
  updatedAt: Date;
}

export const DEFAULT_DEVICE_CONFIG: Omit<DeviceConfig, 'deviceId' | 'updatedAt'> = {
  gamesPerFrame: 3,
  rotationIntervalSeconds: 300,
  selectionMode: 'random',
  showPublisher: true,
  showPlaytime: false,
  avoidRecentRepeats: true,
};
