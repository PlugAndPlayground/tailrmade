// Browser-safe contracts shared with the backend API.

export const CLOUD_MODE = process.env.CLOUD_MODE !== 'false';
export const EXECUTION_LOCATION_CLOUD = 'cloud' as const;
export const EXECUTION_LOCATION_LOCAL = 'local' as const;
export const LOCAL_USER_ID = 'local';

export type ExecutionLocation =
  typeof EXECUTION_LOCATION_CLOUD | typeof EXECUTION_LOCATION_LOCAL;

export type AccountTier = 'limited' | 'free' | 'premium' | 'business' | 'admin';

// Tailrmade tokens are normalized AI spend units shown in the UI:
// 1,000,000 Tailrmade tokens = $1.00 of provider spend.
export const TAILRMADE_TOKENS_PER_USD = 1000000;

export const AI_DAILY_SPEND_LIMIT_USD: Record<AccountTier, number> = {
  limited: 0,
  free: 0.05,
  premium: 1,
  business: 3,
  admin: 10000,
};

export const TOKEN_LIMITS: Record<AccountTier, number> = {
  limited: Math.round(
    AI_DAILY_SPEND_LIMIT_USD.limited * TAILRMADE_TOKENS_PER_USD,
  ),
  free: Math.round(AI_DAILY_SPEND_LIMIT_USD.free * TAILRMADE_TOKENS_PER_USD),
  premium: Math.round(
    AI_DAILY_SPEND_LIMIT_USD.premium * TAILRMADE_TOKENS_PER_USD,
  ),
  business: Math.round(
    AI_DAILY_SPEND_LIMIT_USD.business * TAILRMADE_TOKENS_PER_USD,
  ),
  admin: Math.round(AI_DAILY_SPEND_LIMIT_USD.admin * TAILRMADE_TOKENS_PER_USD),
};

export const COMPANION_REQUEST_LIMITS: Record<AccountTier, number> = {
  limited: 0,
  free: 20,
  premium: 1000,
  business: 10000,
  admin: 100000,
};

export const STORAGE_QUOTA_LIMITS: Record<AccountTier, number> = {
  limited: 0,
  free: 1,
  premium: 1000,
  business: 2000,
  admin: 1000000,
};

export const DEFAULT_QUOTA = STORAGE_QUOTA_LIMITS.free;

export type StorageType = 'graph' | 'object';

export type GraphSortMode = 'date' | 'name';

export interface UserPreferences {
  uid: string;
  saveInCloud: boolean;
  companionLocation: ExecutionLocation;
  aiLocation: ExecutionLocation;
  graphSortMode: GraphSortMode;
  graphSortDirection: boolean;
  aiAgentModel: string;
  /** let the AI assistant look at the app it is building (see AIVisionService) */
  aiAutoCapture: boolean;
}

export interface TokenUsage {
  tokensUsedTotal: number;
  tokensUsedLastDay: number;
  tokensLastDayUsed: Date;
}

export interface UserData {
  uid: string;
  email: string;
  name?: string;
  accountTier: AccountTier;
  createdAt: Date;
  lastLogin?: Date;
  aiUsage: TokenUsage;
  companionUsage: TokenUsage;
  emailVerified?: boolean;
}

export function getDefaultPreferences(uid: string): UserPreferences {
  return {
    uid,
    saveInCloud: CLOUD_MODE,
    companionLocation: CLOUD_MODE
      ? EXECUTION_LOCATION_CLOUD
      : EXECUTION_LOCATION_LOCAL,
    aiLocation: CLOUD_MODE
      ? EXECUTION_LOCATION_CLOUD
      : EXECUTION_LOCATION_LOCAL,
    graphSortMode: 'date',
    graphSortDirection: true,
    aiAgentModel: 'claude-sonnet-4-6',
    aiAutoCapture: true,
  };
}

export function getMaxTokensForTier(tier: AccountTier): number {
  return TOKEN_LIMITS[tier] || 0;
}

export function getEffectiveDailyUsage(
  tokensUsedLastDay: number,
  tokensLastDayUsed: any,
): number {
  const lastUsed =
    tokensLastDayUsed instanceof Date
      ? tokensLastDayUsed
      : tokensLastDayUsed?.toDate
        ? tokensLastDayUsed.toDate()
        : new Date(tokensLastDayUsed);
  const now = new Date();
  if (
    lastUsed.getDate() === now.getDate() &&
    lastUsed.getMonth() === now.getMonth() &&
    lastUsed.getFullYear() === now.getFullYear()
  ) {
    return tokensUsedLastDay;
  }
  return 0;
}
