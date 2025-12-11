
import { GoogleGenAI, GoogleGenAIOptions, Modality } from "@google/genai";
import { logService } from "../logService";
import { dbService } from '../../utils/db';
import { GEMINI_3_RO_MODELS } from "../../constants/modelConstants";
import { DEEP_SEARCH_SYSTEM_PROMPT } from "../../constants/promptConstants";
import { SafetySetting } from "../../types/settings";

// Export constants for polling
export const POLLING_INTERVAL_MS = 2000;
export const MAX_POLLING_DURATION_MS = 10 * 60 * 1000;

/**
 * Helper function: Normalize URL to remove trailing slashes and handle protocol
 * @param url - The URL to normalize
 * @returns Normalized URL or null if empty/invalid
 */
const normalizeUrl = (url: string | null | undefined): string | null => {
    if (!url || !url.trim()) return null;

    let cleanUrl = url.trim();

    // Remove trailing slashes
    while (cleanUrl.endsWith('/')) {
        cleanUrl = cleanUrl.slice(0, -1);
    }

    // Ensure URL has protocol, if not provided assume https
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        cleanUrl = `https://${cleanUrl}`;
    }

    return cleanUrl;
};

/**
 * Get base SDK client with proper Base URL handling via httpOptions
 * @param apiKey - API key for authentication
 * @param specificBaseUrl - (optional) Specific Base URL to use
 */
export const getClient = (apiKey: string, specificBaseUrl?: string | null): GoogleGenAI => {
    try {
        // Sanitize API Key
        const sanitizedApiKey = apiKey
            .replace(/[\u2013\u2014]/g, '-')
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/[\u00A0]/g, ' ');

        if (apiKey !== sanitizedApiKey) {
            logService.warn("API key sanitized: non-ASCII characters removed.");
        }

        // Construct Configuration strictly according to GoogleGenAIOptions interface
        const clientConfig: GoogleGenAIOptions = {
            apiKey: sanitizedApiKey
        };

        // Configure Base URL via httpOptions if provided
        // This overrides the default AI platform service endpoint
        if (specificBaseUrl) {
            clientConfig.httpOptions = {
                baseUrl: specificBaseUrl,
                // apiVersion can be added here if needed, e.g., 'v1beta'
            };
        }

        // Log configuration in Dev mode (masking key)
        if (process.env.NODE_ENV === 'development') {
            console.log('[API Init]', {
                hasKey: !!sanitizedApiKey,
                baseUrl: clientConfig.httpOptions?.baseUrl || 'DEFAULT (Official Google)',
            });
        }

        return new GoogleGenAI(clientConfig);
    } catch (error) {
        logService.error("Failed to initialize GoogleGenAI client:", error);
        throw error;
    }
};

/**
 * Core method: Get API client configured with strict separation logic
 * Logic:
 * 1. Custom Config ON: Use DB Settings (Key & Proxy). NO Env fallback.
 * 2. Custom Config OFF: Use Env Vars (Key & BaseURL).
 */
export const getConfiguredApiClient = async (apiKey: string): Promise<GoogleGenAI> => {
    // 1. Read user settings
    const settings = await dbService.getAppSettings();
    
    let resolvedBaseUrl: string | null = null;

    // 2. Determine Base URL based on strict separation logic
    if (settings?.useCustomApiConfig) {
        // --- Mode: Custom Configuration ---
        // If "Use API Proxy" is checked in UI, use that URL. Otherwise default.
        if (settings.useApiProxy && settings.apiProxyUrl) {
            resolvedBaseUrl = normalizeUrl(settings.apiProxyUrl);
            logService.debug('[API Config] Using Custom Proxy URL from Settings.');
        } else {
            logService.debug('[API Config] Custom Config ON, but Proxy OFF. Using Default Google Endpoint.');
        }
    } else {
        // --- Mode: Environment Configuration ---
        // Use environment variable if available.
        const envBaseUrl = normalizeUrl(process.env.GEMINI_API_BASE_URL);
        if (envBaseUrl) {
            resolvedBaseUrl = envBaseUrl;
            logService.debug('[API Config] Using Base URL from Environment Variables.');
        } else {
            logService.debug('[API Config] Env Config ON, but no Base URL var. Using Default Google Endpoint.');
        }
    }

    // 3. Instantiate client
    // Note: The apiKey passed here is already selected by utils/apiUtils.ts based on the same logic
    return getClient(apiKey, resolvedBaseUrl);
};

// Keep the buildGenerationConfig function unchanged
export const buildGenerationConfig = (
    modelId: string,
    systemInstruction: string,
    config: { temperature?: number; topP?: number },
    showThoughts: boolean,
    thinkingBudget: number,
    isGoogleSearchEnabled?: boolean,
    isCodeExecutionEnabled?: boolean,
    isUrlContextEnabled?: boolean,
    thinkingLevel?: 'LOW' | 'HIGH',
    aspectRatio?: string,
    isDeepSearchEnabled?: boolean,
    imageSize?: string,
    safetySettings?: SafetySetting[]
): any => {
    if (modelId === 'gemini-2.5-flash-image' || modelId === 'gemini-2.5-flash-image-preview') {
        const imageConfig: any = {};
        if (aspectRatio && aspectRatio !== 'Auto') imageConfig.aspectRatio = aspectRatio;

        const config: any = {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        };
        if (Object.keys(imageConfig).length > 0) {
            config.imageConfig = imageConfig;
        }
        return config;
    }

    if (modelId === 'gemini-3-pro-image-preview') {
         const imageConfig: any = {
            imageSize: imageSize || '1K',
         };
         if (aspectRatio && aspectRatio !== 'Auto') {
            imageConfig.aspectRatio = aspectRatio;
         }

         const config: any = {
            responseModalities: ['IMAGE', 'TEXT'],
            imageConfig,
         };

         const tools = [];
         if (isGoogleSearchEnabled || isDeepSearchEnabled) tools.push({ googleSearch: {} });
         if (tools.length > 0) config.tools = tools;

         if (systemInstruction) config.systemInstruction = systemInstruction;

         return config;
    }

    let finalSystemInstruction = systemInstruction;
    if (isDeepSearchEnabled) {
        finalSystemInstruction = finalSystemInstruction
            ? `${finalSystemInstruction}\n\n${DEEP_SEARCH_SYSTEM_PROMPT}`
            : DEEP_SEARCH_SYSTEM_PROMPT;
    }

    const generationConfig: any = {
        ...config,
        systemInstruction: finalSystemInstruction || undefined,
        safetySettings: safetySettings || undefined,
    };
    if (!generationConfig.systemInstruction) {
        delete generationConfig.systemInstruction;
    }

    if (GEMINI_3_RO_MODELS.includes(modelId) || modelId.includes('gemini-3-pro')) {
        generationConfig.thinkingConfig = {
            includeThoughts: showThoughts,
        };

        if (thinkingBudget > 0) {
            generationConfig.thinkingConfig.thinkingBudget = thinkingBudget;
        } else {
            generationConfig.thinkingConfig.thinkingLevel = thinkingLevel || 'HIGH';
        }
    } else {
        const modelSupportsThinking = [
            'models/gemini-flash-lite-latest',
            'gemini-2.5-pro',
            'models/gemini-flash-latest'
        ].includes(modelId) || modelId.includes('gemini-2.5');

        if (modelSupportsThinking) {
            generationConfig.thinkingConfig = {
                thinkingBudget: thinkingBudget,
                includeThoughts: showThoughts,
            };
        }
    }

    const tools = [];
    if (isGoogleSearchEnabled || isDeepSearchEnabled) {
        tools.push({ googleSearch: {} });
    }
    if (isCodeExecutionEnabled) {
        tools.push({ codeExecution: {} });
    }
    if (isUrlContextEnabled) {
        tools.push({ urlContext: {} });
    }

    if (tools.length > 0) {
        generationConfig.tools = tools;
        delete generationConfig.responseMimeType;
        delete generationConfig.responseSchema;
    }

    return generationConfig;
};
