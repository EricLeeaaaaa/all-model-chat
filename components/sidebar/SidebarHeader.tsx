import React from 'react';
import { translations } from '../../utils/appUtils';
import { IconSidebarToggle } from '../icons/CustomIcons';
import { AppLogo } from '../icons/AppLogo';

interface SidebarHeaderProps {
  onToggle: () => void;
  isOpen: boolean;
  t: (key: keyof typeof translations) => string;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({ onToggle, isOpen, t }) => (
  <div className="p-3 sm:p-4 flex items-center justify-between flex-shrink-0 h-[64px] border-b border-[var(--theme-border-primary)]/50">
    <div className="flex items-center gap-3 pl-1 select-none overflow-hidden">
      <AppLogo className="h-8 w-8 rounded-xl shadow-sm" />
      <div className="flex flex-col justify-center">
        <span className="font-bold text-base tracking-tight text-[var(--theme-text-primary)] leading-none">
          {t('app_name_short')}
        </span>
        <span className="text-[10px] font-medium text-[var(--theme-text-tertiary)] uppercase tracking-widest mt-0.5">
          {t('app_edition')}
        </span>
      </div>
    </div>
    <button
        onClick={onToggle}
        className="p-2 text-[var(--theme-icon-history)] hover:bg-[var(--theme-bg-tertiary)] rounded-lg transition-colors"
        aria-label={isOpen ? t('historySidebarClose') : t('historySidebarOpen')}
    >
      <IconSidebarToggle size={20} strokeWidth={2} />
    </button>
  </div>
);