'use client';

import React from 'react';
import { X, Check } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-2xl relative text-neutral-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-300 p-1 rounded transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="text-base font-medium text-white tracking-tight mb-1">
          About HostelSync
        </h3>
        <p className="text-xs text-neutral-400 mb-4">
          A minimalist synchronized hostel space for residents.
        </p>

        <div className="space-y-3 text-xs text-neutral-300 leading-relaxed">
          <p>
            HostelSync is built on a single, focused idea: eliminate complex management dashboards and give residents a fast, direct gateway to their hostel room space.
          </p>
          <p>
            Every hostel has an entry code. Residents identify themselves once, step into their shared space, check who&#39;s in the room, read announcements, log maintenance needs, and track mess schedules without overhead.
          </p>

          <div className="bg-neutral-950/70 border border-neutral-800/80 rounded-lg p-3 space-y-2 mt-3 font-mono text-[11px] text-neutral-400">
            <div className="flex items-center gap-2 text-neutral-300">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Instant room code joining</span>
            </div>
            <div className="flex items-center gap-2 text-neutral-300">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Real-time resident presence</span>
            </div>
            <div className="flex items-center gap-2 text-neutral-300">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Complaints, mess menu & notices</span>
            </div>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-neutral-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-md text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
