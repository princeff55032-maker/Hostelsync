'use client';

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Check, Link as LinkIcon, Smartphone, Loader2 } from 'lucide-react';

interface RoomQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  hostelName: string;
}

export function RoomQrModal({
  isOpen,
  onClose,
  roomCode,
  hostelName,
}: RoomQrModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const roomUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?room=${roomCode}`
      : `http://localhost:3000/?room=${roomCode}`;

  useEffect(() => {
    if (!isOpen) return;

    // Generate real, high-resolution scannable QR code
    QRCode.toDataURL(roomUrl, {
      errorCorrectionLevel: 'H',
      margin: 2,
      scale: 10,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })
      .then((url) => {
        setQrDataUrl(url);
      })
      .catch((err) => {
        console.error('Failed to generate QR code:', err);
      });
  }, [isOpen, roomUrl]);

  if (!isOpen) return null;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(roomUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-xs bg-[#111113] border border-neutral-800 rounded-2xl p-6 text-center shadow-2xl relative select-none">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-500 hover:text-white p-1 rounded-md transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Room Header */}
        <div className="mb-4">
          <h3 className="text-base font-semibold text-white tracking-tight mb-1 truncate">
            {hostelName}
          </h3>
          <p className="text-xs text-neutral-400 font-mono">
            Room Code: {roomCode}
          </p>
        </div>

        {/* Real Scannable QR Code Canvas / Image */}
        <div className="w-48 h-48 mx-auto p-3 bg-white rounded-xl flex items-center justify-center mb-3 shadow-lg">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`Scannable QR code for room ${roomCode}`}
              className="w-full h-full object-contain rounded-sm"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-neutral-400 gap-1.5 text-xs">
              <Loader2 className="w-5 h-5 animate-spin text-neutral-600" />
              <span>Generating QR...</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-1 text-[11px] text-neutral-400 mb-4">
          <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
          <span>Scan with phone camera to sync</span>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleCopyCode}
            className="w-full py-2.5 px-3 bg-neutral-900 hover:bg-neutral-800 border border-neutral-750 text-white rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-[0.99]"
          >
            {copiedCode ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Code Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-neutral-400" />
                <span>Copy Code ({roomCode})</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCopyLink}
            className="w-full py-2 px-3 bg-neutral-950 hover:bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Link Copied!</span>
              </>
            ) : (
              <>
                <LinkIcon className="w-3.5 h-3.5 text-neutral-500" />
                <span>Copy Room URL</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
