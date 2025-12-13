import { useState, useCallback } from 'react';
import { ModelOption } from '../types';
import { getDefaultModelOptions } from '../utils/appUtils';
import { CUSTOM_MODELS_KEY } from '../constants/appConstants';

export const useModels = () => {
    // Initialize with persisted models or defaults
    const [apiModels, setApiModelsState] = useState<ModelOption[]>(() => {
        try {
            const stored = localStorage.getItem(CUSTOM_MODELS_KEY);
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {
            console.error('Failed to load custom models', e);
        }
        return getDefaultModelOptions();
    });

    const setApiModels = useCallback((models: ModelOption[]) => {
        setApiModelsState(models);
        localStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(models));
    }, []);

    const isModelsLoading = false;
    const modelsLoadingError = null;

    return { apiModels, setApiModels, isModelsLoading, modelsLoadingError };
};