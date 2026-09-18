import InterfaceController, { ListenEvent } from '../InterfaceController';
import { CLOUD_MODE, EXECUTION_LOCATION_CLOUD } from './shared-types';
import { BackendGateway } from './BackendGateway';

const LOCAL_COMPANION_ADDRESS = 'http://localhost:6655';
const POLL_INTERVAL = 4000;
const REQUEST_TIMEOUT_MS = 30_000;

export class CompanionRequestError extends Error {}

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
      if (preferences.companionLocation === EXECUTION_LOCATION_CLOUD) {
        return BackendGateway.getInstance().getCloudCompanionBaseUrl();
      }
    } catch (error) {
      throw new CompanionRequestError(
        'Unable to read Companion location. Check your Companion location setting and retry.',
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
      const companionAddress = await this.getCompanionAddress();
      const isCloud =
        companionAddress ===
        BackendGateway.getInstance().getCloudCompanionBaseUrl();
      const name = isCloud ? 'Cloud Companion' : 'Local Companion';
      if (isCloud && !BackendGateway.getInstance().isLoggedIn()) {
        throw new CompanionRequestError(
          'Cloud Companion requires sign-in. Sign in or select Local in Companion location.',
        );
      }
      let headers: Record<string, string> = {};
      if (isCloud) {
        try {
          headers = await BackendGateway.getInstance().getAuthHeader();
        } catch (_) {
          throw new CompanionRequestError(
            'Cloud Companion authentication failed. Sign in again and retry.',
          );
        }
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );
      try {
        const res = await fetch(companionAddress + '/forward', {
          method: 'Post',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: JSON.stringify(message),
        });
        if (!res.ok) {
          if (isCloud && (res.status === 401 || res.status === 403)) {
            throw new CompanionRequestError(
              'Cloud Companion access was denied. Sign in again and check your account access.',
            );
          }
          if (isCloud && res.status === 429) {
            throw new CompanionRequestError(
              'Cloud Companion request limit reached. Try again later or select Local in Companion location.',
            );
          }
          throw new CompanionRequestError(
            `${name} returned HTTP ${res.status}. ${isCloud ? 'Try again later.' : 'Check the Companion logs and restart it.'}`,
          );
        }
        let companionRes: any;
        try {
          companionRes = await res.json();
        } catch (error) {
          if (controller.signal.aborted) throw error;
          throw new CompanionRequestError(
            `${name} returned an invalid response. ${isCloud ? 'Try again later.' : 'Update or restart the Companion and retry.'}`,
          );
        }
        const tokenLimitMessage = this.getTokenLimitMessage(companionRes);
        if (tokenLimitMessage) {
          throw new CompanionRequestError(
            `${name} usage limit reached. Try again after the limit resets${isCloud ? ' or select Local in Companion location' : ''}.`,
          );
        }
        if (
          !companionRes ||
          typeof companionRes.status !== 'number' ||
          !('response' in companionRes)
        ) {
          throw new CompanionRequestError(
            `${name} returned an invalid response. Check that the Companion is up to date and retry.`,
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
        if (error instanceof CompanionRequestError) throw error;
        if (controller.signal.aborted) {
          throw new CompanionRequestError(
            `${name} request timed out after 30 seconds. Check the Companion and target API before retrying; the request may already have been processed.`,
          );
        }
        throw new CompanionRequestError(
          isCloud
            ? 'Cloud Companion is unreachable. Check your internet connection and retry, or select Local in Companion location.'
            : `Local Companion is unreachable at ${companionAddress}. Start the Companion and retry. Check that the browser can access this address.`,
        );
      } finally {
        clearTimeout(timeoutId);
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
