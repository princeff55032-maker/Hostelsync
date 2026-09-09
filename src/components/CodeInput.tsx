'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Loader2, ArrowRight, AlertCircle } from 'lucide-react';
import { Hostel } from '@/lib/types';
import { audioEngine } from '@/lib/audioEngine';

interface CodeInputProps {
  onJoin: (code: string) => void;
  findHostel: (code: string) => Promise<Hostel | null> | Hostel | null;
}

export function CodeInput({ onJoin, findHostel }: CodeInputProps) {
  // We manage the 4-char suffix (e.g. 7K42) while displaying HS- fixed prefix
  // or allowing full typing
  const [codeValue, setCodeValue] = useState<string>('');
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [matchedHostel, setMatchedHostel] = useState<Hostel | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  const fullFormattedCode = codeValue ? (codeValue.startsWith('HS-') ? codeValue : `HS-${codeValue}`) : '';

  // Validate code when input changes
  useEffect(() => {
    if (!codeValue) {
      setMatchedHostel(null);
      setErrorMessage(null);
      setIsValidating(false);
      return;
    }

    const cleanCode = codeValue.startsWith('HS-') ? codeValue : `HS-${codeValue}`;

    // If 4 chars entered after HS-
    const suffix = cleanCode.replace(/^HS-/, '');
    if (suffix.length === 4) {
      setIsValidating(true);
      setErrorMessage(null);
      let isCancelled = false;

      const timer = setTimeout(async () => {
        try {
          const found = await Promise.resolve(findHostel(cleanCode));
          if (isCancelled) return;
          setIsValidating(false);
          if (found) {
            const isCreator =
              typeof window !== 'undefined' &&
              (sessionStorage.getItem(`hostelsync_creator_${cleanCode}`) === 'true' ||
                localStorage.getItem(`hostelsync_creator_${cleanCode}`) === 'true');

            if (found.isLocked && !isCreator) {
              setMatchedHostel(null);
              setErrorMessage('🔒 This room is locked by the creator');
            } else {
              setMatchedHostel(found);
              setErrorMessage(null);
            }
          } else {
            setMatchedHostel(null);
            setErrorMessage(`No rooms found for ${cleanCode}`);
          }
        } catch {
          if (isCancelled) return;
          setIsValidating(false);
          setMatchedHostel(null);
          setErrorMessage(`No rooms found for ${cleanCode}`);
        }
      }, 250);

      return () => {
        isCancelled = true;
        clearTimeout(timer);
      };
    } else {
      setMatchedHostel(null);
      setErrorMessage(null);
      setIsValidating(false);
    }
  }, [codeValue, findHostel]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    
    // Normalize if user pastes full HS-XXXX
    if (val.startsWith('HS-')) {
      val = val.substring(3);
    } else if (val.startsWith('HS')) {
      val = val.substring(2);
    }
    // Limit to 4 alphanumeric characters for the suffix
    val = val.replace(/[^A-Z0-9]/g, '').slice(0, 4);
    setCodeValue(val);
  };

  const handleSlotClick = () => {
    hiddenInputRef.current?.focus();
  };

  const handleJoin = async (targetCode?: string) => {
    const raw = (targetCode || matchedHostel?.code || codeValue || '').trim().toUpperCase();
    const suffix = raw.replace(/^HS-/, '');
    const code = suffix.length === 4 ? `HS-${suffix}` : (raw.startsWith('HS-') ? raw : `HS-${raw}`);

    if (matchedHostel && matchedHostel.code === code) {
      const isCreator =
        typeof window !== 'undefined' &&
        (sessionStorage.getItem(`hostelsync_creator_${code}`) === 'true' ||
          localStorage.getItem(`hostelsync_creator_${code}`) === 'true');
      if (matchedHostel.isLocked && !isCreator) {
        setErrorMessage('🔒 This room is locked by the creator');
        return;
      }
      hiddenInputRef.current?.blur();
      audioEngine.unlockAudio();
      onJoin(code);
      return;
    }

    if (suffix.length === 4) {
      setIsValidating(true);
      const found = await Promise.resolve(findHostel(code));
      setIsValidating(false);
      if (found) {
        const isCreator =
          typeof window !== 'undefined' &&
          (sessionStorage.getItem(`hostelsync_creator_${code}`) === 'true' ||
            localStorage.getItem(`hostelsync_creator_${code}`) === 'true');
        if (found.isLocked && !isCreator) {
          setMatchedHostel(null);
          setErrorMessage('🔒 This room is locked by the creator');
          return;
        }
        setMatchedHostel(found);
        hiddenInputRef.current?.blur();
        audioEngine.unlockAudio();
        onJoin(found.code);
      } else {
        setMatchedHostel(null);
        setErrorMessage(`No rooms found for ${code}`);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleJoin();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleJoin();
  };

  const quickSelect = (sampleCode: string) => {
    const suffix = sampleCode.replace('HS-', '');
    setCodeValue(suffix);
    hiddenInputRef.current?.focus();
  };

  // 4 slots for the suffix characters
  const slots = [0, 1, 2, 3];

  return (
    <form onSubmit={handleSubmit} className="w-full flex flex-col items-center">
      {/* Code Slot Container */}
      <div
        onClick={handleSlotClick}
        className="relative flex items-center justify-center gap-1.5 cursor-pointer select-none"
      >
        {/* Hidden native input for mobile and keyboard navigation */}
        <input
          ref={hiddenInputRef}
          type="text"
          value={codeValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          maxLength={6}
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          autoFocus
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-20"
          aria-label="Enter 4-character hostel code suffix"
        />

        {/* Fixed "HS" Prefix Box */}
        <div className="w-10 h-11 flex items-center justify-center bg-neutral-900 border border-neutral-800 rounded-md text-xs font-mono font-semibold tracking-wider text-neutral-400 select-none shadow-xs">
          HS
        </div>

        {/* Divider Dash */}
        <div className="text-neutral-600 font-mono font-bold text-sm px-0.5 select-none">
          -
        </div>

        {/* 4 Dynamic Code Character Slots */}
        {slots.map((index) => {
          const char = codeValue[index] || '';
          const isCurrentActive = codeValue.length === index;

          return (
            <div
              key={index}
              className={`w-9 h-11 flex items-center justify-center rounded-md font-mono text-base font-medium transition-all duration-150 ${
                isCurrentActive
                  ? 'bg-neutral-800 border-white text-white ring-1 ring-white/30 shadow-xs'
                  : char
                  ? 'bg-neutral-800/90 border-neutral-700 text-white shadow-xs'
                  : 'bg-neutral-800/50 border-neutral-800 text-neutral-500'
              } border`}
            >
              {char ? (
                <span>{char}</span>
              ) : isCurrentActive ? (
                <span className="w-1.5 h-4 bg-white/70 animate-pulse rounded-full" />
              ) : (
                <span className="text-neutral-600 text-xs">·</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Validation / Loading state */}
      <div className="h-6 mt-2.5 flex items-center justify-center text-xs">
        {isValidating && (
          <span className="inline-flex items-center gap-1.5 text-neutral-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            Validating code...
          </span>
        )}
        {!isValidating && errorMessage && (
          <span className="inline-flex items-center gap-1 text-red-400">
            <AlertCircle className="w-3 h-3" />
            {errorMessage}
          </span>
        )}
      </div>

      {/* Matched Room Card */}
      {matchedHostel && (
        <div className="w-full mt-1 p-3.5 bg-neutral-950/80 border border-neutral-800 rounded-lg text-left transition-all animate-in fade-in duration-200">
          <div className="flex items-center justify-between text-xs text-neutral-400 mb-1">
            <span className="text-sm font-medium text-white truncate">
              {matchedHostel.name}
            </span>
            <span className="font-mono text-neutral-400 text-xs font-medium">{matchedHostel.code}</span>
          </div>
          <div className="text-xs text-neutral-400 mt-0.5">
            {matchedHostel.totalResidents} residents · {matchedHostel.totalRooms} rooms
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleJoin(matchedHostel.code);
            }}
            onPointerDown={(e) => {
              // Prevents mobile virtual keyboard blur from cancelling the tap
              e.preventDefault();
            }}
            className="w-full mt-3 py-2.5 px-4 bg-white text-black hover:bg-neutral-200 active:bg-neutral-300 rounded-md font-medium text-xs tracking-wide transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-[0.99] select-none"
          >
            <span>Join Room</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </form>
  );
}
