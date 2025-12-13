import { useCallback, Dispatch, SetStateAction } from 'react';
import { AppSettings, SavedChatSession, SavedScenario, ChatGroup, Theme } from '../types';
import { DEFAULT_APP_SETTINGS } from '../constants/appConstants';
import { logService } from '../utils/appUtils';
import {
    sanitizeFilename,
    exportElementAsPng,
    exportHtmlStringAsFile,
    exportTextStringAsFile,
    gatherPageStyles,
    triggerDownload,
    generateExportHtmlTemplate,
    generateExportTxtTemplate,
    embedImagesInClone,
    createSnapshotContainer
} from '../utils/exportUtils';
import DOMPurify from 'dompurify';

type SessionsUpdater = (updater: (prev: SavedChatSession[]) => SavedChatSession[]) => void;
type GroupsUpdater = (updater: (prev: ChatGroup[]) => ChatGroup[]) => void;

interface DataManagementProps {
    appSettings: AppSettings;
    setAppSettings: Dispatch<SetStateAction<AppSettings>>;
    savedSessions: SavedChatSession[];
    updateAndPersistSessions: SessionsUpdater;
    savedGroups: ChatGroup[];
    updateAndPersistGroups: GroupsUpdater;
    savedScenarios: SavedScenario[];
    handleSaveAllScenarios: (scenarios: SavedScenario[]) => void;
    t: (key: string) => string;
    activeChat: SavedChatSession | undefined;
    scrollContainerRef: React.RefObject<HTMLDivElement>;
    currentTheme: Theme;
    language: 'en' | 'zh';
}

export const useDataManagement = ({
    appSettings,
    setAppSettings,
    savedSessions,
    updateAndPersistSessions,
    savedGroups,
    updateAndPersistGroups,
    savedScenarios,
    handleSaveAllScenarios,
    t,
    activeChat,
    scrollContainerRef,
    currentTheme,
    language,
}: DataManagementProps) => {

    const handleExportSettings = useCallback(() => {
        logService.info(`Exporting settings.`);
        try {
            const dataToExport = { type: 'AIStudio-Settings', version: 1, settings: appSettings };
            const jsonString = JSON.stringify(dataToExport, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const date = new Date().toISOString().slice(0, 10);
            triggerDownload(URL.createObjectURL(blob), `ai-studio-settings-${date}.json`);
        } catch (error) {
            logService.error('Failed to export settings', { error });
            alert(t('export_failed_title'));
        }
    }, [appSettings, t]);

    const handleExportHistory = useCallback(() => {
        logService.info(`Exporting chat history.`);
        try {
            const dataToExport = { type: 'AIStudio-History', version: 1, history: savedSessions, groups: savedGroups };
            const jsonString = JSON.stringify(dataToExport, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const date = new Date().toISOString().slice(0, 10);
            triggerDownload(URL.createObjectURL(blob), `ai-studio-history-${date}.json`);
        } catch (error) {
            logService.error('Failed to export history', { error });
            alert(t('export_failed_title'));
        }
    }, [savedSessions, savedGroups, t]);

    const handleExportAllScenarios = useCallback(() => {
        logService.info(`Exporting all scenarios.`);
        try {
            const dataToExport = { type: 'AIStudio-Scenarios', version: 1, scenarios: savedScenarios };
            const jsonString = JSON.stringify(dataToExport, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const date = new Date().toISOString().slice(0, 10);
            triggerDownload(URL.createObjectURL(blob), `ai-studio-scenarios-${date}.json`);
        } catch (error) {
            logService.error('Failed to export scenarios', { error });
            alert(t('export_failed_title'));
        }
    }, [savedScenarios, t]);

    const handleImportFile = useCallback((file: File, expectedType: string, onValid: (data: any) => void) => {
        logService.info(`Importing ${expectedType} from file: ${file.name}`);
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result as string;
                const data = JSON.parse(text);
                if (data && data.type === expectedType) {
                    onValid(data);
                } else {
                    throw new Error(`Invalid file format. Expected type: ${expectedType}, found: ${data.type || 'none'}`);
                }
            } catch (error) {
                logService.error(`Failed to import ${expectedType}`, { error });
                alert(`${t('settingsImport_error')} Error: ${error instanceof Error ? error.message : String(error)}`);
            }
        };
        reader.onerror = (e) => {
            logService.error(`Failed to read ${expectedType} file`, { error: e });
            alert(t('settingsImport_error'));
        };
        reader.readAsText(file);
    }, [t]);

    const handleImportSettings = useCallback((file: File) => {
        handleImportFile(file, 'AIStudio-Settings', (data) => {
            const importedSettings = data.settings;
            const newSettings = { ...DEFAULT_APP_SETTINGS };
            for (const key of Object.keys(DEFAULT_APP_SETTINGS) as Array<keyof AppSettings>) {
                if (Object.prototype.hasOwnProperty.call(importedSettings, key)) {
                    const importedValue = importedSettings[key];
                    const defaultValue = DEFAULT_APP_SETTINGS[key];
                    if (typeof importedValue === typeof defaultValue || (['apiKey', 'apiProxyUrl', 'lockedApiKey'].includes(key) && (typeof importedValue === 'string' || importedValue === null))) {
                        (newSettings as any)[key] = importedValue;
                    }
                }
            }
            setAppSettings(newSettings);
            alert(t('settingsImport_success'));
        });
    }, [handleImportFile, setAppSettings, t]);

    const handleImportHistory = useCallback((file: File) => {
        handleImportFile(file, 'AIStudio-History', (data) => {
            if (data.history && Array.isArray(data.history)) {
                updateAndPersistSessions((prev) => {
                    const existingIds = new Set(prev.map(s => s.id));
                    const newSessions = data.history.filter((s: SavedChatSession) => !existingIds.has(s.id));
                    return [...prev, ...newSessions];
                });

                if (data.groups && Array.isArray(data.groups)) {
                    updateAndPersistGroups((prev) => {
                        const existingIds = new Set(prev.map(g => g.id));
                        const newGroups = data.groups.filter((g: ChatGroup) => !existingIds.has(g.id));
                        return [...prev, ...newGroups];
                    });
                }

                alert(t('settingsImportHistory_success'));
            } else {
                throw new Error('History data is missing or not an array.');
            }
        });
    }, [handleImportFile, t, updateAndPersistSessions, updateAndPersistGroups]);

    const handleImportAllScenarios = useCallback((file: File) => {
        handleImportFile(file, 'AIStudio-Scenarios', (data) => {
            if (data.scenarios && Array.isArray(data.scenarios)) {
                handleSaveAllScenarios(data.scenarios);
                alert(t('scenarios_feedback_imported'));
            } else {
                throw new Error('Scenarios data is missing or not an array.');
            }
        });
    }, [handleImportFile, t, handleSaveAllScenarios]);

    const exportChatLogic = useCallback(async (format: 'png' | 'html' | 'txt' | 'json') => {
        if (!activeChat) return;

        const safeTitle = sanitizeFilename(activeChat.title);
        const dateObj = new Date();
        const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString();
        const isoDate = dateObj.toISOString().slice(0, 10);
        const filename = `chat-${safeTitle}-${isoDate}.${format}`;
        const scrollContainer = scrollContainerRef.current;

        if (format === 'png') {
            if (!scrollContainer) return;
            let cleanup = () => {};
            try {
                const { container, innerContent, remove, rootBgColor } = await createSnapshotContainer(
                    currentTheme.id,
                    '800px'
                );
                cleanup = remove;
                const chatClone = scrollContainer.cloneNode(true) as HTMLElement;
                chatClone.querySelectorAll('details').forEach(details => { details.setAttribute('open', ''); });
                chatClone.querySelectorAll('.sticky').forEach(el => el.remove());
                chatClone.querySelectorAll('[data-message-id]').forEach(el => {
                    (el as HTMLElement).style.animation = 'none';
                    (el as HTMLElement).style.opacity = '1';
                    (el as HTMLElement).style.transform = 'none';
                });

                const headerHtml = `
                    <div style="padding: 2rem 2rem 1rem 2rem; border-bottom: 1px solid var(--theme-border-secondary); margin-bottom: 1rem;">
                        <h1 style="font-size: 1.5rem; font-weight: bold; color: var(--theme-text-primary); margin-bottom: 0.5rem;">${activeChat.title}</h1>
                        <div style="font-size: 0.875rem; color: var(--theme-text-tertiary); display: flex; gap: 1rem;">
                            <span>${dateStr}</span>
                            <span>•</span>
                            <span>${activeChat.settings.modelId}</span>
                        </div>
                    </div>
                `;
                innerContent.innerHTML = `${headerHtml}<div style="padding: 0 2rem 2rem 2rem;">${chatClone.innerHTML}</div>`;
                await new Promise(resolve => setTimeout(resolve, 800));
                await exportElementAsPng(container, filename, { backgroundColor: rootBgColor, scale: 2 });
            } finally { cleanup(); }
            return;
        }

        if (format === 'html') {
            if (!scrollContainer) return;
            const chatClone = scrollContainer.cloneNode(true) as HTMLElement;
            const selectorsToRemove = ['button', '.message-actions', '.sticky', 'input', 'textarea', '.code-block-utility-button', '[role="tooltip"]', '.loading-dots-container'];
            chatClone.querySelectorAll(selectorsToRemove.join(',')).forEach(el => el.remove());
            chatClone.querySelectorAll('details').forEach(el => el.setAttribute('open', 'true'));
            await embedImagesInClone(chatClone);
            const styles = await gatherPageStyles();
            const bodyClasses = document.body.className;
            const rootBgColor = getComputedStyle(document.documentElement).getPropertyValue('--theme-bg-primary');
            const chatHtml = chatClone.innerHTML;

            const fullHtml = generateExportHtmlTemplate({
                title: DOMPurify.sanitize(activeChat.title),
                date: dateStr,
                model: activeChat.settings.modelId,
                contentHtml: chatHtml,
                styles,
                themeId: currentTheme.id,
                language,
                rootBgColor,
                bodyClasses
            });
            exportHtmlStringAsFile(fullHtml, filename);
        } else if (format === 'txt') {
            const txtContent = generateExportTxtTemplate({
                title: activeChat.title,
                date: dateStr,
                model: activeChat.settings.modelId,
                messages: activeChat.messages.map(m => ({
                    role: m.role === 'user' ? 'USER' : 'ASSISTANT',
                    timestamp: m.timestamp,
                    content: m.content,
                    files: m.files?.map(f => ({ name: f.name }))
                }))
            });
            exportTextStringAsFile(txtContent, filename);
        } else if (format === 'json') {
            logService.info(`Exporting chat ${activeChat.id} as JSON.`);
            try {
                const dataToExport = {
                    type: 'AIStudio-History', // Consistent type
                    version: 1,
                    history: [activeChat],
                    groups: [],
                };
                const jsonString = JSON.stringify(dataToExport, null, 2);
                const blob = new Blob([jsonString], { type: 'application/json' });
                triggerDownload(URL.createObjectURL(blob), filename);
            } catch (error) {
                logService.error('Failed to export chat as JSON', { error });
                alert(t('export_failed_title'));
            }
        }
    }, [activeChat, currentTheme, language, scrollContainerRef, t]);

    return {
        handleExportSettings,
        handleExportHistory,
        handleExportAllScenarios,
        handleImportSettings,
        handleImportHistory,
        handleImportAllScenarios,
        exportChatLogic,
    };
};
