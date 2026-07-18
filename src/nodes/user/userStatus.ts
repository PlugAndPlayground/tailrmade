import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import { BackendGateway } from '../../services/BackendGateway';
import type { QuotaInfo } from '../../services/BackendApiClient';
import { SOCKET_TYPE } from '../../utils/constants';
import {
  AccountTier,
  STORAGE_QUOTA_LIMITS,
  TOKEN_LIMITS,
  getEffectiveDailyUsage,
} from '../../services/shared-types';
import { BooleanType } from '../datatypes/booleanType';
import { NumberType } from '../datatypes/numberType';
import { StringType } from '../datatypes/stringType';

const isLoggedInName = 'Is Logged In';
const userNameName = 'User Name';
const accountTierName = 'Account Tier';
const storageUsed = 'Storage Used';
const storageLimit = 'Storage Limit';
const AIUsage = 'AI Usage';
const AILimit = 'AI Limit';

export class UserStatus extends PPNode {
  public getTags(): string[] {
    return ['User', 'Status'].concat(super.getTags());
  }

  public getName() {
    return 'User Status';
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.OUT, isLoggedInName, new BooleanType(), false),
      new Socket(SOCKET_TYPE.OUT, userNameName, new StringType()),
      new Socket(SOCKET_TYPE.OUT, accountTierName, new StringType()),
      new Socket(SOCKET_TYPE.OUT, storageUsed, new NumberType()),
      new Socket(SOCKET_TYPE.OUT, storageLimit, new NumberType()),
      new Socket(SOCKET_TYPE.OUT, AIUsage, new NumberType()),
      new Socket(SOCKET_TYPE.OUT, AILimit, new NumberType()),
    ];
  }

  protected async onExecute(input, output) {
    const handler = BackendGateway.getInstance();
    const user = handler.getCurrentUser();

    if (!user) {
      output[isLoggedInName] = false;
      output[userNameName] = '';
      output[accountTierName] = '';
      output[storageUsed] = 0;
      output[storageLimit] = 0;
      output[AIUsage] = 0;
      output[AILimit] = 0;
    } else {
      // Get user data from backend (same as UserProfile component)
      const userData = await handler.refreshCurrentUserData();

      // Get storage quota (same as UserProfile component)
      let quota: QuotaInfo | null = null;
      try {
        quota = await handler.getStorageQuota();
      } catch (err) {
        console.error('Error fetching storage quota:', err);
      }

      output[isLoggedInName] = true;
      // Use same logic as UserProfile: userData?.name || user?.displayName || 'User'
      output[userNameName] = userData?.name || user?.displayName || 'User';
      // Use actual account tier from userData
      const tier = userData!.accountTier as AccountTier;
      output[accountTierName] = tier;
      output[storageUsed] = quota!.currentUsage;
      output[storageLimit] = STORAGE_QUOTA_LIMITS[tier] ?? 0;
      output[AIUsage] = getEffectiveDailyUsage(
        userData!.aiUsage.tokensUsedLastDay,
        userData!.aiUsage.tokensLastDayUsed,
      );
      output[AILimit] = TOKEN_LIMITS[tier] ?? 0;
    }
  }

  public isDependentOnUserData(): boolean {
    return true;
  }
}
