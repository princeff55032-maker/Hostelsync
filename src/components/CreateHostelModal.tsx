'use client';

import React, { useState } from 'react';
import { X, Copy, Check, ArrowRight, Loader2 } from 'lucide-react';
import { HostelSyncLogo } from './HostelSyncLogo';
import { Hostel } from '@/lib/types';
import { audioEngine } from '@/lib/audioEngine';

interface CreateHostelModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultUserName: string;
  onCreate: (name: string, residentName: string, rooms: number) => { code: string; hostel: Hostel };
  onEnterHostel: (code: string) => void;
}

export function CreateHostelModal({
  isOpen,
  onClose,
  defaultUserName,
  onCreate,
  onEnterHostel,
}: CreateHostelModalProps) {
  const [hostelName, setHostelName] = useState('');
  const [residentName, setResidentName] = useState(defaultUserName);
  const [roomsCount, setRoomsCount] = useState('40');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostelName.trim()) return;

    setIsSubmitting(true);
    setTimeout(() => {
      const parsedRooms = parseInt(roomsCount, 10) || 40;
      const res = onCreate(hostelName.trim(), residentName.trim() || defaultUserName, parsedRooms);
      setCreatedCode(res.code);
      setIsSubmitting(false);
    }, 300);
  };

  const handleCopy = () => {
    if (createdCode) {
      navigator.clipboard.writeText(createdCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleResetAndClose = () => {
    setHostelName('');
    setCreatedCode(null);
    setCopied(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-2xl relative text-neutral-200">
        {/* Close Button */}
        <button
          onClick={handleResetAndClose}
          className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-300 p-1 rounded transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {!createdCode ? (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <HostelSyncLogo size="sm" iconOnly />
              <h3 className="text-base font-medium text-white tracking-tight">Create Room</h3>
            </div>
            <p className="text-xs text-neutral-400 mb-5">
              Set up a shared space and get an instant join code.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Room name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Beats Lounge, Room 101"
                  value={hostelName}
                  onChange={(e) => setHostelName(e.target.value)}
                  autoFocus
                  className="w-full bg-neutral-800/80 border border-neutral-700 focus:border-white focus:bg-neutral-800 rounded-md px-3 py-2 text-sm text-white placeholder:text-neutral-500 outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Your name
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter your name"
                  value={residentName}
                  onChange={(e) => setResidentName(e.target.value)}
                  className="w-full bg-neutral-800/80 border border-neutral-700 focus:border-white focus:bg-neutral-800 rounded-md px-3 py-2 text-sm text-white placeholder:text-neutral-500 outline-none transition-colors"
                />
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting || !hostelName.trim()}
                  className="w-full py-2.5 px-4 bg-white text-black hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-full font-medium text-xs tracking-wide transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Generating space...</span>
                    </>
                  ) : (
                    <span>Create Room</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="text-center py-2 animate-in fade-in duration-200">
            <p className="text-xs text-neutral-400 mb-2">Your Room code</p>
            <div className="inline-block bg-neutral-950 border border-neutral-800 px-5 py-2.5 rounded-lg font-mono text-2xl font-bold tracking-widest text-white mb-2 shadow-inner">
              {createdCode}
            </div>
            <p className="text-xs text-neutral-400 mb-5">
              Share this code with friends to let them join.
            </p>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleCopy}
                className="w-full py-2 px-4 bg-neutral-800 hover:bg-neutral-700/80 border border-neutral-700 text-white rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied to clipboard</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  audioEngine.unlockAudio();
                  onEnterHostel(createdCode);
                  handleResetAndClose();
                }}
                className="w-full py-2 px-4 bg-white text-black hover:bg-neutral-200 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <span>Join Room</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
