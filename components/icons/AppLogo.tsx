
import React from 'react';

export const AppLogo: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className, style }) => {
  return (
    <img
      src="/icons/Icon-192.png"
      alt="AI Studio OSS"
      className={`object-contain ${className}`}
      style={style}
      aria-label="AI Studio OSS Logo"
    />
  );
};
