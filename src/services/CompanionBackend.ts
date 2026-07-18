import InterfaceController, { ListenEvent } from '../InterfaceController';
import { CLOUD_MODE, EXECUTION_LOCATION_CLOUD } from './shared-types';
import { BackendGateway } from './BackendGateway';

const LOCAL_COMPANION_ADDRESS = 'http://localhost:6655';
const POLL_INTERVAL = 4000;

export interface CompanionMessage {
  finalHeaders: Record<string, any>;
  finalBody: string;
  finalURL: string;
  finalMethod: string;
}

export class CompanionBackend {
  private static companion: CompanionBackend | undefined = undefined;
  hasConnection = false;
  dummyCompanion = false;
  preparedDummyResponses: any[] = [];

  private async getCompanionAddress(): Promise<string> {
    if (!CLOUD_MODE) {
      return LOCAL_COMPANION_ADDRESS;
    }
    try {
      const preferences =
        await BackendGateway.getInstance().getUserPreferences();
      if (
        BackendGateway.getInstance().isLoggedIn() &&
        preferences.companionLocation === EXECUTION_LOCATION_CLOUD
      ) {
        return BackendGateway.getInstance().getCloudCompanionBaseUrl();
      }
    } catch (error) {
      console.warn(
        'Failed to get companion location preference, defaulting to local',
      );
    }
    return LOCAL_COMPANION_ADDRESS;
  }

  private async testConnection(): Promise<boolean> {
    let newResult = false;

    if (this.dummyCompanion) {
      newResult = true;
    } else {
      try {
        const companionAddress = await this.getCompanionAddress();
        // Add AbortController to timeout the fetch request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000); // 1 second timeout

        const response = await fetch(companionAddress + '/ping', {
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        newResult = response.ok;
      } catch (error) {
        // Silent failure - connection is simply unavailable
        newResult = false;
      }
    }

    if (this.hasConnection !== newResult) {
      this.hasConnection = newResult;
      InterfaceController.notifyListeners(
        ListenEvent.CompanionConnected,
        newResult,
      );
    }

    return newResult;
  }

  private getTokenLimitMessage(payload: any): string | undefined {
    const message = payload?.response?.error;
    if (typeof message !== 'string') {
      return undefined;
    }

    if (
      /token limit exceeded|token usage limit exceeded|daily token limit exceeded|out of tokens/i.test(
        message,
      )
    ) {
      return message;
    }
    return undefined;
  }

  public async sendMessage(message: CompanionMessage): Promise<any> {
    if (this.dummyCompanion) {
      return this.preparedDummyResponses.shift();
    } else {
      try {
        const companionAddress = await this.getCompanionAddress();
        const isCloud =
          companionAddress ===
          BackendGateway.getInstance().getCloudCompanionBaseUrl();
        const res = fetch(companionAddress + '/forward', {
          method: 'Post',
          headers: {
            'Content-Type': 'application/json',
            ...(isCloud
              ? await BackendGateway.getInstance().getAuthHeader()
              : {}),
          },
          body: JSON.stringify(message),
        });
        const companionRes = await (await res).json();
        const tokenLimitMessage = this.getTokenLimitMessage(companionRes);
        if (tokenLimitMessage) {
          InterfaceController.showSnackBar(
            `Cloud Companion limit reached: ${tokenLimitMessage}`,
            { variant: 'warning' },
          );
        }

        if (isCloud) {
          try {
            const domain = new URL(message.finalURL).hostname;
            BackendGateway.getInstance().logCloudCompanionUsage(domain);
          } catch (_) {}
        }

        return companionRes;
      } catch (error) {
        return {
          status: 400,
          response: {
            text: 'Unable to reach companion, is it running and reachable?',
          },
        };
      }
    }
  }

  private async testConnectionContinously() {
    while (true) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      await this.testConnection();
    }
  }
  private constructor() {
    // this was annoying
    //void this.testConnectionContinously();
  }
  public static getInstance() {
    if (CompanionBackend.companion == undefined) {
      this.companion = new CompanionBackend();
    }
    return this.companion;
  }

  public setEnableDummyCompanion(enabled: boolean) {
    this.dummyCompanion = enabled;
  }

  public addDummyResponse(response: any) {
    // when using dummy mode, doing "send message" will instead pop the stack of the dummy responses
    this.preparedDummyResponses.push(response);
  }
}
