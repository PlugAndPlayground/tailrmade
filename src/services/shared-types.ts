// Browser-safe contracts shared with the backend API.
import { DEFAULT_MODEL } from './aiModels';

export const CLOUD_MODE = process.env.CLOUD_MODE !== 'false';
export const EXECUTION_LOCATION_CLOUD = 'cloud' as const;
export const EXECUTION_LOCATION_LOCAL = 'local' as const;
export const LOCAL_USER_ID = 'local';

export type ExecutionLocation =
  typeof EXECUTION_LOCATION_CLOUD | typeof EXECUTION_LOCATION_LOCAL;

export type AccountTier = 'limited' | 'free' | 'premium' | 'business' | 'admin';

export const STORAGE_QUOTA_LIMITS: Record<AccountTier, number> = {
  limited: 0,
  free: 1,
  premium: 1000,
  business: 2000,
  admin: 1000000,
};

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

// Mirrors the backend contract; limits and usage always come from /user-data.
export interface AllowanceWindow {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string; // ISO, UTC
}

export interface UserAllowances {
  ai: {
    daily: AllowanceWindow;
    monthly: AllowanceWindow;
  };
  companion: { daily: AllowanceWindow };
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
  allowances?: UserAllowances;
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
    aiAgentModel: DEFAULT_MODEL,
    aiAutoCapture: true,
  };
}
