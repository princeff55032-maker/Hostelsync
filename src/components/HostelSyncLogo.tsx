import React from 'react';

interface LogoProps {
  className?: string;
  iconOnly?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function HostelSyncLogo({ className = '', iconOnly = false, size = 'md' }: LogoProps) {
  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  return (
    <div className={`inline-flex items-center gap-2 font-sans select-none ${className}`}>
      {/* Stylized H-Sync Mark matching brand asset */}
      <svg
        className={`${iconSizes[size]} shrink-0`}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Left vertical pillar */}
        <rect x="3" y="5" width="4.5" height="22" rx="2.25" fill="#38BDF8" />
        {/* Inner top sync bar */}
        <rect x="10.5" y="5" width="4.5" height="12" rx="2.25" fill="#38BDF8" />
        {/* Inner bottom sync bar */}
        <rect x="17" y="15" width="4.5" height="12" rx="2.25" fill="#38BDF8" />
        {/* Right vertical pillar */}
        <rect x="24.5" y="5" width="4.5" height="22" rx="2.25" fill="#38BDF8" />
      </svg>

      {!iconOnly && (
        <span className={`font-semibold tracking-tight text-white ${textSizes[size]}`}>
          HostelSync
        </span>
      )}
    </div>
  );
}
