'use client';

import React from 'react';
import { PlusCircle } from 'lucide-react';
import { CodeInput } from './CodeInput';
import { Footer } from './Footer';
import { HostelSyncLogo } from './HostelSyncLogo';
import { Hostel } from '@/lib/types';

interface JoinCardProps {
  userName?: string;
  onNameChange?: (name: string) => void;
  onRegenerate?: () => void;
  findHostel: (code: string) => Hostel | null;
  onJoin: (code: string) => void;
  onOpenCreate: () => void;
  onOpenAbout: () => void;
}

export function JoinCard({
  findHostel,
  onJoin,
  onOpenCreate,
  onOpenAbout,
}: JoinCardProps) {
  return (
    <div className="w-full px-2.5 sm:px-1 max-w-[28rem] mx-auto mt-20 sm:mt-24 lg:mt-28 animate-in fade-in duration-200">
      <div className="flex flex-col items-center justify-center p-6 sm:p-7 bg-neutral-900 rounded-xl border border-neutral-800 shadow-2xl mx-auto">
        {/* Brand Logo */}
        <div className="mb-4">
          <HostelSyncLogo size="md" />
        </div>

        {/* Main Heading */}
        <h2 className="text-base font-medium tracking-tight mb-1 text-white">
          Join a HostelSync
        </h2>

        {/* Subheading */}
        <p className="text-neutral-400 mb-5 text-center text-xs">
          Enter a hostel code to join or create a new hostel
        </p>

        {/* Primary Code Input */}
        <div className="w-full">
          <CodeInput onJoin={onJoin} findHostel={findHostel} />

          {/* Secondary Action: Create new hostel */}
          <div className="flex flex-col gap-3 mt-5">
            <button
              type="button"
              onClick={onOpenCreate}
              className="px-5 py-2.5 bg-white text-black hover:bg-neutral-200 rounded-full font-medium text-xs tracking-wide cursor-pointer w-full transition-colors flex items-center justify-center gap-2 shadow-xs active:scale-[0.99]"
            >
              <PlusCircle className="w-4 h-4 text-black" />
              <span>Create new hostel</span>
            </button>
          </div>
        </div>

        {/* Tagline note */}
        <p className="text-neutral-500 mt-5 text-center text-xs leading-relaxed">
          Synchronized community space for residents.
        </p>

        {/* BeatSync Style Minimal Footer */}
        <Footer onOpenAbout={onOpenAbout} />
      </div>
    </div>
  );
}
