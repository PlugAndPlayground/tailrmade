import { normalizeAIAgentModel } from '../services/aiModels';
import { useUserPreferences } from './useUserPreferences';

export function useAIAgentModelPreference() {
  const [preferences, savePreferences] = useUserPreferences();
  const selectedModel = normalizeAIAgentModel(preferences.aiAgentModel);

  const saveSelectedModel = (model: string) => {
    savePreferences({ aiAgentModel: normalizeAIAgentModel(model) });
  };

  return [selectedModel, saveSelectedModel] as const;
}
