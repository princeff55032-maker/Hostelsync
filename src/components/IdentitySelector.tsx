'use client';

import React, { useState } from 'react';
import { RotateCw, Check, Edit2 } from 'lucide-react';

interface IdentitySelectorProps {
  userName: string;
  onNameChange: (name: string) => void;
  onRegenerate: () => void;
}

export function IdentitySelector({
  userName,
  onNameChange,
  onRegenerate,
}: IdentitySelectorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputVal, setInputVal] = useState(userName);
  const [isSpinning, setIsSpinning] = useState(false);

  const handleSave = () => {
    if (inputVal.trim()) {
      onNameChange(inputVal.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setInputVal(userName);
      setIsEditing(false);
    }
  };

  const handleRegenerateClick = () => {
    setIsSpinning(true);
    onRegenerate();
    setTimeout(() => setIsSpinning(false), 300);
  };

  return (
    <div className="flex items-center justify-center mt-5 text-sm text-neutral-400">
      <span>You&#39;ll join as</span>

      {isEditing ? (
        <div className="inline-flex items-center ml-1.5 gap-1">
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            autoFocus
            maxLength={24}
            className="bg-neutral-800 border border-neutral-700 text-white px-2 py-0.5 rounded text-sm font-medium w-28 focus:outline-none focus:border-white"
          />
          <button
            type="button"
            onClick={handleSave}
            aria-label="Save name"
            className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors"
          >
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setInputVal(userName);
            setIsEditing(true);
          }}
          className="ml-1.5 group inline-flex items-center gap-1 font-medium text-white hover:text-neutral-200 transition-colors"
          title="Click to change your name"
        >
          <span className="underline decoration-neutral-600 underline-offset-4 group-hover:decoration-neutral-400">
            {userName}
          </span>
          <Edit2 className="w-3 h-3 text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      )}

      <button
        type="button"
        onClick={handleRegenerateClick}
        className="inline-flex items-center gap-1 rounded-md font-medium text-xs text-neutral-500 hover:text-neutral-300 ml-2.5 h-6 px-2 hover:bg-neutral-800/80 transition-colors active:scale-95"
        title="Generate random resident identity"
      >
        <RotateCw
          className={`w-3 h-3 transition-transform duration-300 ${
            isSpinning ? 'rotate-180 text-white' : ''
          }`}
        />
        <span>Regenerate</span>
      </button>
    </div>
  );
}
