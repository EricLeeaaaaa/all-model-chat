
import { GoogleGenAI, Modality } from "@google/genai";
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
 * Get base SDK client with proper Base URL handling
 * @param apiKey - API key for authentication
 * @param specificBaseUrl - (optional) Specific Base URL to use, typically passed from getConfiguredApiClient
 */
export const getClient = (apiKey: string, specificBaseUrl?: string | null): GoogleGenAI => {
    try {
        // Sanitize the API key to replace common non-ASCII characters that might
        // be introduced by copy-pasting from rich text editors. This prevents
        // "Failed to execute 'append' on 'Headers': Invalid character" errors.
        const sanitizedApiKey = apiKey
            .replace(/[\u2013\u2014]/g, '-') // en-dash, em-dash to hyphen
            .replace(/[\u2018\u2019]/g, "'") // smart single quotes to apostrophe
            .replace(/[\u201C\u201D]/g, '"') // smart double quotes to quote
            .replace(/[\u00A0]/g, ' '); // non-breaking space to regular space

        if (apiKey !== sanitizedApiKey) {
            logService.warn("API key sanitized: non-ASCII characters removed.");
        }

        const clientConfig: any = { apiKey: sanitizedApiKey };

        // Determine effective Base URL following priority logic:
        // 1. If specificBaseUrl (from config) is provided, use it
        // 2. Otherwise, fallback to environment variable
        // 3. If neither is provided, SDK will use official default (no baseUrl needed)
        const envBaseUrl = normalizeUrl(process.env.GEMINI_API_BASE_URL);
        const effectiveBaseUrl = specificBaseUrl ? normalizeUrl(specificBaseUrl) : envBaseUrl;

        // Only set baseUrl parameter if we have a custom URL (not the default Google endpoint)
        // GoogleGenAI SDK will automatically handle /v1beta and other paths internally
        if (effectiveBaseUrl && !effectiveBaseUrl.includes('generativelanguage.googleapis.com')) {
            clientConfig.baseUrl = effectiveBaseUrl;
        }

        // Log the decision for debugging
        if (import.meta.env.DEV) {
            console.log('[API Init]', {
                apiKey: '***',
                baseUrl: clientConfig.baseUrl || 'DEFAULT (Official)',
                source: specificBaseUrl ? 'AppConfig' : (envBaseUrl ? 'EnvVar' : 'Default')
            });
        }

        return new GoogleGenAI(clientConfig);
    } catch (error) {
        logService.error("Failed to initialize GoogleGenAI client:", error);
        throw error;
    }
};

/**
 * Core method: Get API client configured with complete settings (database settings + environment variables)
 * This is the entry point that all requests in the app should use
 */
export const getConfiguredApiClient = async (apiKey: string): Promise<GoogleGenAI> => {
    // 1. Read user settings from database
    const settings = await dbService.getAppSettings();

    // 2. Determine Base URL following priority logic:
    // Priority 1: User has enabled Custom Config + Use Proxy and provided a URL in settings
    const isCustomProxyEnabled = settings?.useCustomApiConfig && settings?.useApiProxy;
    const customProxyUrl = isCustomProxyEnabled ? settings?.apiProxyUrl : null;

    // Priority 2: Environment variable (process.env.GEMINI_API_BASE_URL)
    // Priority 3: null (let SDK use default value)

    // normalizeUrl will handle null values safely
    const envBaseUrl = process.env.GEMINI_API_BASE_URL;

    let resolvedBaseUrl: string | null = null;

    if (customProxyUrl && customProxyUrl.trim() !== '') {
        resolvedBaseUrl = customProxyUrl;
        logService.debug('[API Config] Using Custom Proxy URL from Settings.');
    } else if (envBaseUrl && envBaseUrl.trim() !== '') {
        resolvedBaseUrl = envBaseUrl;
        logService.debug('[API Config] Using Base URL from Environment Variables.');
    } else {
        logService.debug('[API Config] Using Default Google Endpoint.');
    }

    // 3. Instantiate client
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
