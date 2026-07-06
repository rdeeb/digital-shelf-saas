export type PublicSettings = {
  steam: {
    id64: string;
    apiKeyConfigured: boolean;
    openIdEnabled: boolean;
    connected: boolean;
  };
  server: {
    publicUrl: string;
  };
  display: {
    spineStyle: 'image' | 'gradient';
    showTitle: boolean;
  };
};

export type AuthMeResponse = {
  user: {
    id: string;
    steamId64: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
};

export type BillingCycle = 'monthly' | 'annual';

export type BillingPlanId = 'plan_basic' | 'plan_pro';

export type BillingPlan = {
  id: BillingPlanId;
  name: string;
  deviceLimit: number | null;
};

export type BillingSalesFlags = {
  newEnabled: boolean;
  renewalsEnabled: boolean;
  stopMessage: string;
};

export type BillingPlansResponse = {
  plans: BillingPlan[];
  salesFlags: BillingSalesFlags;
};

export type BillingStatusResponse = {
  subscription: {
    planId: string;
    status: string;
    provider: string;
    billingCycle: string;
    currentPeriodEnd: string | null;
  } | null;
  deviceLimit: number | null;
  canClaimDevice: boolean;
};

export type UserSettingsResponse = {
  display: {
    showPublisher: boolean;
    showPlaytime: boolean;
    gamesPerFrame: 1 | 2 | 3;
    rotationIntervalSeconds: number;
    selectionMode: 'random' | 'backlog' | 'favorites' | 'most_played' | 'never_played';
    avoidRecentRepeats: boolean;
  };
  notifications: {
    emailOptIn: boolean;
  };
};

export type PaypalSubscribeResponse = {
  approvalUrl: string;
};

export type SetupStatus = {
  complete: boolean;
  steps: {
    apiKey: { done: boolean };
    steamConnected: { done: boolean };
    librarySynced: { done: boolean; totalGames: number };
  };
};

export type SyncStatus = {
  syncRun: {
    id: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    gamesDiscovered: number | null;
    gamesAdded: number | null;
    gamesUpdated: number | null;
    errorCode: string | null;
    errorMessage: string | null;
  } | null;
  library: {
    totalGames: number;
    lastSyncAt: string | null;
  };
  isSyncing: boolean;
};

export type MetadataStatus = {
  metadataJob: {
    id: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    queued: number;
    enriched: number;
    skipped: number;
    failed: number;
  } | null;
  library: {
    totalGames: number;
    withPublisher: number;
    withoutPublisher: number;
    lastEnrichedAt: string | null;
  };
  isRefreshing: boolean;
};

export type GameListItem = {
  userGameId: string;
  gameId: string;
  name: string;
  publishers: string[];
  playtimeMinutes: number | null;
  favorite: boolean;
  hidden: boolean;
  metadataUpdatedAt: string | null;
};

export type GamesResponse = {
  games: GameListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type DeviceListItem = {
  id: string;
  name: string;
  hardwareId: string;
  status: 'pending' | 'claimed';
  isPreview: boolean;
  screenWidth: number;
  screenHeight: number;
  firmwareVersion: string | null;
  lastSeenAt: string | null;
  lastWifiRssi: number | null;
  lastFrameId: string | null;
  createdAt: string;
};

export type DeviceConfig = {
  deviceId: string;
  gamesPerFrame: 1 | 2 | 3;
  rotationIntervalSeconds: number;
  selectionMode: 'random' | 'backlog' | 'favorites' | 'most_played' | 'never_played';
  showPublisher: boolean;
  showPlaytime: boolean;
  avoidRecentRepeats: boolean;
  updatedAt: string;
};

export type DeviceDetail = DeviceListItem & {
  config: DeviceConfig | null;
};

export type FrameSummary = {
  frameId: string;
  deviceId: string;
  width: number;
  height: number;
  gameIds: string[];
  games: Array<{ id: string; name: string; publishers: string[] }>;
  generatedAt: string;
  expiresAt: string;
  ttlSeconds: number;
  cached: boolean;
  spineStyle: string;
  showTitle: boolean;
  downloadUrls: {
    png: string;
    rgb565: string;
  };
};

export type AdminLogsResponse = {
  syncRuns: Array<{
    id: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    gamesDiscovered: number | null;
    gamesAdded: number | null;
    gamesUpdated: number | null;
    errorCode: string | null;
    errorMessage: string | null;
  }>;
  metadataJob: {
    id: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    queued: number;
    enriched: number;
    skipped: number;
    failed: number;
  } | null;
};

export type RecentErrorsResponse = {
  errors: Array<{
    id: string;
    timestamp: string;
    code: string;
    message: string;
    source: string;
    context?: Record<string, string>;
  }>;
};
