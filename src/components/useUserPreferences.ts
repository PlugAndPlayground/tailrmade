import { useCallback, useEffect, useState } from 'react';
import type { UserPreferences } from '../services/shared-types';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import {
  getCachedUserPreferences,
  userPreferencesStore,
} from './userPreferencesStore';

export { getCachedUserPreferences };

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(
    getCachedUserPreferences(),
  );

  useEffect(() => {
    let isMounted = true;

    const loadPreferences = async () => {
      const nextPreferences = await userPreferencesStore.load();
      if (isMounted) {
        setPreferences(nextPreferences);
      }
    };

    void loadPreferences();

    const listenerID = InterfaceController.addListeners(
      [ListenEvent.UserPreferencesUpdated, ListenEvent.UserIsLoggedIn],
      (data: UserPreferences | boolean, event: ListenEvent) => {
        if (event === ListenEvent.UserPreferencesUpdated) {
          if (isMounted) {
            setPreferences(
              userPreferencesStore.cacheExternal(data as UserPreferences),
            );
          }
          return;
        }
        void loadPreferences();
      },
    );

    return () => {
      isMounted = false;
      InterfaceController.removeListener(listenerID);
    };
  }, []);

  const savePreferences = useCallback((updates: Partial<UserPreferences>) => {
    setPreferences(userPreferencesStore.getOptimisticPreferences(updates));
    void userPreferencesStore.save(updates);
  }, []);

  return [preferences, savePreferences] as const;
}
