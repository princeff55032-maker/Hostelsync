'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Headphones,
  Crown,
  Sparkles,
  RotateCw,
  Info,
  ArrowUp,
  Sliders,
  Compass,
  Radio,
  Volume2,
  Activity,
  RotateCcw,
  SlidersHorizontal,
  Flame,
  Mic,
  Disc,
  Layers,
} from 'lucide-react';
import { audioEngine } from '@/lib/audioEngine';

export interface SpatialFilterParams {
  volumeMultiplier: number;
  pan: number;
  lowPassHz: number;
  highPassHz: number;
  bassGainDb: number;
  trebleGainDb: number;
  presetVolumeScale: number;
  presetId: string;
}

interface SpatialAudioTabProps {
  userName: string;
  isHost?: boolean;
  onSpatialChange?: (params: SpatialFilterParams) => void;
}

interface FilterPreset {
  id: string;
  name: string;
  iconType: 'flat' | 'bass' | 'vocal' | 'lofi' | 'nextdoor' | 'club';
  volumeScale: number;
  lowPassHz: number;
  highPassHz: number;
  bassDb: number;
  trebleDb: number;
}

const FILTER_PRESETS: FilterPreset[] = [
  { id: 'flat', name: 'Studio Flat', iconType: 'flat', volumeScale: 1.0, lowPassHz: 20000, highPassHz: 20, bassDb: 0, trebleDb: 0 },
  { id: 'bass', name: 'Bass Boost', iconType: 'bass', volumeScale: 1.0, lowPassHz: 20000, highPassHz: 20, bassDb: 8, trebleDb: 1 },
  { id: 'vocal', name: 'Vocal Boost', iconType: 'vocal', volumeScale: 1.0, lowPassHz: 18000, highPassHz: 120, bassDb: -2, trebleDb: 5 },
  { id: 'lofi', name: 'Lo-Fi Vinyl', iconType: 'lofi', volumeScale: 0.82, lowPassHz: 3600, highPassHz: 300, bassDb: 3, trebleDb: -4 },
  { id: 'nextdoor', name: 'Next Door', iconType: 'nextdoor', volumeScale: 0.38, lowPassHz: 900, highPassHz: 20, bassDb: 6, trebleDb: -12 },
  { id: 'club', name: 'Nightclub', iconType: 'club', volumeScale: 0.95, lowPassHz: 14000, highPassHz: 40, bassDb: 10, trebleDb: 2 },
];

export function SpatialAudioTab({
  userName,
  isHost = true,
  onSpatialChange,
}: SpatialAudioTabProps) {
  const [isSpatialEnabled, setIsSpatialEnabled] = useState<boolean>(true);

  // Smooth floating-point coordinates (0% to 100%)
  // Speaker / Host position
  const [speakerPos, setSpeakerPos] = useState<{ x: number; y: number }>({ x: 50, y: 28 });
  const speakerPosRef = useRef(speakerPos);
  speakerPosRef.current = speakerPos;

  // Listener position (headphones)
  const [listenerPos, setListenerPos] = useState<{ x: number; y: number }>({ x: 50, y: 64 });

  // Dragging state
  const [draggingNode, setDraggingNode] = useState<'speaker' | 'listener' | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Rotation Orbit
  const [isRotating, setIsRotating] = useState<boolean>(false);
  const rotationAngleRef = useRef<number>(Math.PI / 2);
  const rotationAnimRef = useRef<number | null>(null);

  // Studio Music Filters
  const [activePreset, setActivePreset] = useState<string>('flat');
  const [lowPassValue, setLowPassValue] = useState<number>(0); // 0 = OFF (20kHz), 100 = 200Hz
  const [highPassValue, setHighPassValue] = useState<number>(0); // 0 = OFF (20Hz), 100 = 2000Hz
  const [bassGain, setBassGain] = useState<number>(0); // -12dB to +12dB
  const [trebleGain, setTrebleGain] = useState<number>(0); // -12dB to +12dB

  // Throttled notification tracking
  const lastNotifiedMultRef = useRef<number>(-1);
  const lastNotifiedPresetRef = useRef<string>('');

  // Initials for avatar
  const initials = userName
    ? userName
        .split(' ')
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'P';

  // Distance between speaker and listener
  const dx = speakerPos.x - listenerPos.x;
  const dy = speakerPos.y - listenerPos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Spatial volume attenuation
  const spatialVolumePercent = isSpatialEnabled
    ? Math.max(30, Math.min(100, Math.round(100 - (distance / 65) * 70)))
    : 100;

  // Convert slider values to frequencies
  const calculatedLowPassHz =
    lowPassValue === 0 ? 20000 : Math.round(20000 * Math.pow(200 / 20000, lowPassValue / 100));

  const calculatedHighPassHz =
    highPassValue === 0 ? 20 : Math.round(20 * Math.pow(2000 / 20, highPassValue / 100));

  const currentPresetObj = FILTER_PRESETS.find((p) => p.id === activePreset);
  const currentVolumeScale = currentPresetObj ? currentPresetObj.volumeScale : 1.0;

  // Sync spatial and filter parameters with Web Audio engine and parent player
  useEffect(() => {
    const mult = isSpatialEnabled ? spatialVolumePercent / 100 : 1.0;
    // Stereo Pan: from -1.0 (left) to +1.0 (right) based on relative X position
    const pan = isSpatialEnabled ? Math.max(-1, Math.min(1, (listenerPos.x - speakerPos.x) / 35)) : 0;
    const combinedMult = mult * currentVolumeScale;

    const params: SpatialFilterParams = {
      volumeMultiplier: mult,
      pan,
      lowPassHz: calculatedLowPassHz,
      highPassHz: calculatedHighPassHz,
      bassGainDb: bassGain,
      trebleGainDb: trebleGain,
      presetVolumeScale: currentVolumeScale,
      presetId: activePreset,
    };

    audioEngine.setSpatialFilterParams({
      volumeMultiplier: combinedMult,
      pan,
      lowPassHz: calculatedLowPassHz,
      highPassHz: calculatedHighPassHz,
      bassGainDb: bassGain,
      trebleGainDb: trebleGain,
    });

    // Notify parent without causing cascading render depth overflows
    if (
      Math.abs(lastNotifiedMultRef.current - combinedMult) >= 0.01 ||
      lastNotifiedPresetRef.current !== activePreset
    ) {
      lastNotifiedMultRef.current = combinedMult;
      lastNotifiedPresetRef.current = activePreset;
      onSpatialChange?.(params);
    }
  }, [
    isSpatialEnabled,
    spatialVolumePercent,
    speakerPos,
    listenerPos,
    calculatedLowPassHz,
    calculatedHighPassHz,
    bassGain,
    trebleGain,
    currentVolumeScale,
    activePreset,
    onSpatialChange,
  ]);

  // Apply a Music Filter Preset
  const applyPreset = (preset: FilterPreset) => {
    audioEngine.resume();
    setActivePreset(preset.id);
    if (preset.id === 'flat') {
      setLowPassValue(0);
      setHighPassValue(0);
    } else {
      if (preset.lowPassHz < 20000) {
        // Approximate slider percentage
        const p = Math.round((Math.log(preset.lowPassHz / 20000) / Math.log(200 / 20000)) * 100);
        setLowPassValue(Math.max(0, Math.min(100, p)));
      } else {
        setLowPassValue(0);
      }
      if (preset.highPassHz > 20) {
        const p = Math.round((Math.log(preset.highPassHz / 20) / Math.log(2000 / 20)) * 100);
        setHighPassValue(Math.max(0, Math.min(100, p)));
      } else {
        setHighPassValue(0);
      }
    }
    setBassGain(preset.bassDb);
    setTrebleGain(preset.trebleDb);

    // Play instant acoustic preview cue so user immediately hears the audio filter
    audioEngine.previewFilterCue(preset.id);
  };

  // Reset all filters to flat
  const handleResetFilters = () => {
    applyPreset(FILTER_PRESETS[0]);
  };

  // Smooth pointer drag handlers
  const startDrag = (node: 'speaker' | 'listener', e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingNode(node);
  };

  useEffect(() => {
    if (!draggingNode) return;

    const onPointerMove = (e: PointerEvent) => {
      if (!gridRef.current) return;
      const rect = gridRef.current.getBoundingClientRect();
      const rawX = ((e.clientX - rect.left) / rect.width) * 100;
      const rawY = ((e.clientY - rect.top) / rect.height) * 100;

      // Smooth floating-point boundary clamping
      const x = Math.max(10, Math.min(90, rawX));
      const y = Math.max(10, Math.min(90, rawY));

      if (draggingNode === 'speaker') {
        setSpeakerPos({ x, y });
      } else {
        setListenerPos({ x, y });
      }
    };

    const onPointerUp = () => {
      setDraggingNode(null);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [draggingNode]);

  // Click on grid to smoothly place listener
  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingNode || !gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const x = Math.max(10, Math.min(90, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(10, Math.min(90, ((e.clientY - rect.top) / rect.height) * 100));
    setListenerPos({ x, y });
  };

  // "Move to Top" handler with pleasant spacing
  const handleMoveToTop = () => {
    setSpeakerPos({ x: 50, y: 22 });
    setListenerPos({ x: 50, y: 62 });
  };

  // Calming, gentle organic rotation orbit (slow ~14s rotation cycle)
  useEffect(() => {
    if (isRotating) {
      const radius = 24; // orbit radius percentage
      let lastTime = performance.now();

      const animate = (time: number) => {
        const elapsed = time - lastTime;
        if (elapsed >= 40) {
          lastTime = time;
          rotationAngleRef.current = (rotationAngleRef.current + 0.02) % (Math.PI * 2);
          const curSpeaker = speakerPosRef.current;
          const centerX = curSpeaker.x;
          const centerY = curSpeaker.y + 24;
          const newX = Math.max(12, Math.min(88, centerX + Math.cos(rotationAngleRef.current) * radius));
          const newY = Math.max(12, Math.min(88, centerY + Math.sin(rotationAngleRef.current) * radius));
          setListenerPos({ x: newX, y: newY });
        }
        rotationAnimRef.current = requestAnimationFrame(animate);
      };

      rotationAnimRef.current = requestAnimationFrame(animate);
    } else {
      if (rotationAnimRef.current) {
        cancelAnimationFrame(rotationAnimRef.current);
        rotationAnimRef.current = null;
      }
    }

    return () => {
      if (rotationAnimRef.current) {
        cancelAnimationFrame(rotationAnimRef.current);
        rotationAnimRef.current = null;
      }
    };
  }, [isRotating]);

  return (
    <div className="p-3.5 sm:p-4 flex flex-col space-y-4 text-xs select-none pb-32 lg:pb-12">
      {/* 1. Spatial Audio Header & Switch */}
      <div className="flex items-center justify-between min-h-[40px]">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-white" />
          <span className="font-semibold text-white text-sm">Spatial Audio</span>
        </div>

        {/* Toggle Switch */}
        <button
          type="button"
          onClick={() => setIsSpatialEnabled((prev) => !prev)}
          className={`w-12 h-7 rounded-full transition-colors relative cursor-pointer p-0.5 border flex items-center ${
            isSpatialEnabled
              ? 'bg-emerald-500 border-emerald-400 shadow-sm shadow-emerald-500/20'
              : 'bg-neutral-800 border-neutral-700'
          }`}
          title={isSpatialEnabled ? 'Disable Spatial Audio' : 'Enable Spatial Audio'}
        >
          <div
            className={`w-5 h-5 rounded-full shadow-md transition-transform duration-200 ${
              isSpatialEnabled
                ? 'translate-x-5 bg-white'
                : 'translate-x-0.5 bg-neutral-400'
            }`}
          />
        </button>
      </div>

      {/* 2. 2D Interactive Studio Spatial Grid with zero-lag smooth motion */}
      <div
        ref={gridRef}
        onClick={handleGridClick}
        className="w-full aspect-square bg-[#0b0b0e] border border-neutral-800/80 rounded-2xl relative overflow-hidden shadow-inner cursor-crosshair select-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.04) 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px',
        }}
      >
        {/* Subtle center crosshair guide */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
          <div className="w-full h-px bg-neutral-600" />
          <div className="h-full w-px bg-neutral-600 absolute" />
        </div>

        {/* Real-time distance radar wave */}
        {isSpatialEnabled && (
          <div
            className="absolute rounded-full border border-emerald-500/30 bg-emerald-500/5 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{
              left: `${speakerPos.x}%`,
              top: `${speakerPos.y}%`,
              width: `${Math.max(32, distance * 2.1)}%`,
              height: `${Math.max(32, distance * 2.1)}%`,
            }}
          />
        )}

        {/* HOST / SPEAKER NODE (Initial + Crown) */}
        <div
          onPointerDown={(e) => startDrag('speaker', e)}
          className={`absolute -translate-x-1/2 -translate-y-1/2 z-20 cursor-grab active:cursor-grabbing select-none touch-none ${
            draggingNode === 'speaker' ? 'scale-105 shadow-xl' : ''
          }`}
          style={{
            left: `${speakerPos.x}%`,
            top: `${speakerPos.y}%`,
            touchAction: 'none',
          }}
          title="Speaker / Host Origin (Drag to move)"
        >
          <div className="relative">
            <div className="w-12 h-12 rounded-full bg-emerald-800/95 border-2 border-emerald-500/80 shadow-lg shadow-emerald-950 flex items-center justify-center text-emerald-100 font-bold text-xs">
              {initials}
            </div>
            {/* Host Crown */}
            <div className="absolute -top-1.5 -right-1 bg-neutral-900 rounded-full p-0.5 border border-amber-500/60 shadow">
              <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            </div>
          </div>
        </div>

        {/* LISTENING SOURCE NODE (Headphones) */}
        <div
          onPointerDown={(e) => startDrag('listener', e)}
          className={`absolute -translate-x-1/2 -translate-y-1/2 z-30 cursor-grab active:cursor-grabbing select-none touch-none ${
            draggingNode === 'listener' ? 'scale-110 shadow-2xl' : ''
          }`}
          style={{
            left: `${listenerPos.x}%`,
            top: `${listenerPos.y}%`,
            touchAction: 'none',
          }}
          title="Listening Source (Drag to hear distance and pan changes)"
        >
          <div className="w-10 h-10 rounded-full bg-emerald-950 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-950/80">
            <Headphones className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* 3. Distance / Volume Indicator & Move to Top Button */}
      <div className="flex items-center justify-between gap-3 pt-0.5">
        <div className="flex items-center gap-2 flex-1">
          <span className="font-mono text-xs text-neutral-300 min-w-[36px]">
            {isSpatialEnabled ? `${spatialVolumePercent}%` : '100%'}
          </span>
          <div className="flex-1 h-2 bg-neutral-850 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-100"
              style={{
                width: isSpatialEnabled ? `${spatialVolumePercent}%` : '100%',
              }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleMoveToTop}
          className="px-3.5 py-2 min-h-[38px] bg-neutral-850 hover:bg-neutral-750 text-white font-medium text-xs rounded-xl border border-neutral-750 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 active:scale-95"
        >
          <ArrowUp className="w-3.5 h-3.5" />
          <span>Move to Top</span>
        </button>
      </div>

      {/* 4. Audio Effects & Orbit Rotation */}
      <div className="p-3.5 bg-neutral-900/90 border border-neutral-800/90 rounded-xl space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-medium text-white text-xs">
            <Sparkles className="w-3.5 h-3.5 text-neutral-300" />
            <span>Audio Effects</span>
          </div>

          <button
            type="button"
            onClick={handleResetFilters}
            className="text-[10px] text-neutral-500 hover:text-neutral-300 flex items-center gap-1 cursor-pointer transition-colors"
            title="Reset filters to default"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            <span>Reset</span>
          </button>
        </div>

        {/* Orbit Rotation Effect */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-neutral-300">
            <RotateCw className={`w-3.5 h-3.5 text-emerald-400 ${isRotating ? 'animate-spin' : ''}`} />
            <span>Rotation Orbit</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsRotating(true)}
              className={`px-3 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer ${
                isRotating
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/30'
                  : 'bg-neutral-800 text-neutral-300 hover:text-white'
              }`}
            >
              Start
            </button>
            <button
              type="button"
              onClick={() => setIsRotating(false)}
              className={`px-3 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer ${
                !isRotating
                  ? 'bg-neutral-800 text-neutral-300 hover:text-white'
                  : 'bg-neutral-850 text-neutral-400 hover:text-white'
              }`}
            >
              Stop
            </button>
          </div>
        </div>

        {/* Low-Pass Filter Slider */}
        <div className="space-y-1.5 pt-2 border-t border-neutral-800/60">
          <div className="flex items-center justify-between text-neutral-300">
            <div className="flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-neutral-400" />
              <span>Low-Pass Filter</span>
            </div>
            <span className="font-mono text-[11px] text-neutral-400">
              {lowPassValue === 0 ? 'OFF' : `${calculatedLowPassHz}Hz`}
            </span>
          </div>

          <input
            type="range"
            min="0"
            max="100"
            value={lowPassValue}
            onChange={(e) => {
              setActivePreset('custom');
              setLowPassValue(parseInt(e.target.value, 10));
            }}
            className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
        </div>

        {/* High-Pass Filter Slider */}
        <div className="space-y-1.5 pt-1.5 border-t border-neutral-800/60">
          <div className="flex items-center justify-between text-neutral-300">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-neutral-400" />
              <span>High-Pass Filter</span>
            </div>
            <span className="font-mono text-[11px] text-neutral-400">
              {highPassValue === 0 ? 'OFF' : `${calculatedHighPassHz}Hz`}
            </span>
          </div>

          <input
            type="range"
            min="0"
            max="100"
            value={highPassValue}
            onChange={(e) => {
              setActivePreset('custom');
              setHighPassValue(parseInt(e.target.value, 10));
            }}
            className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
        </div>
      </div>

      {/* 5. Music Filters & Studio Presets */}
      <div className="p-3.5 bg-neutral-900/90 border border-neutral-800/90 rounded-xl space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-medium text-white text-xs">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span>Music Filter Presets</span>
          </div>
          <span className="text-[10px] font-mono uppercase text-neutral-500">
            {activePreset}
          </span>
        </div>

        {/* Filter Preset Buttons - Zero Emojis, Pure Lucide Vector Icons */}
        <div className="grid grid-cols-3 gap-2">
          {FILTER_PRESETS.map((p) => {
            const isSel = activePreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                className={`p-2.5 sm:p-3 min-h-[62px] rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 active:scale-95 ${
                  isSel
                    ? 'bg-neutral-800 border-emerald-500/80 text-white shadow-xs'
                    : 'bg-neutral-950/60 border-neutral-800/80 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-850'
                }`}
              >
                <div>
                  {p.iconType === 'flat' && (
                    <SlidersHorizontal className={`w-4 h-4 ${isSel ? 'text-emerald-400' : 'text-neutral-400'}`} />
                  )}
                  {p.iconType === 'bass' && (
                    <Flame className={`w-4 h-4 ${isSel ? 'text-amber-400' : 'text-neutral-400'}`} />
                  )}
                  {p.iconType === 'vocal' && (
                    <Mic className={`w-4 h-4 ${isSel ? 'text-sky-400' : 'text-neutral-400'}`} />
                  )}
                  {p.iconType === 'lofi' && (
                    <Disc className={`w-4 h-4 ${isSel ? 'text-teal-400' : 'text-neutral-400'}`} />
                  )}
                  {p.iconType === 'nextdoor' && (
                    <Layers className={`w-4 h-4 ${isSel ? 'text-indigo-400' : 'text-neutral-400'}`} />
                  )}
                  {p.iconType === 'club' && (
                    <Sparkles className={`w-4 h-4 ${isSel ? 'text-purple-400' : 'text-neutral-400'}`} />
                  )}
                </div>
                <span className="text-[11px] font-medium leading-tight truncate">
                  {p.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* Bass & Treble Equalizer */}
        <div className="space-y-3 pt-2.5 border-t border-neutral-800/60">
          {/* Bass Shelf */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-neutral-300 text-[11px]">
              <span>Bass EQ</span>
              <span className="font-mono text-[10px] text-neutral-400">
                {bassGain > 0 ? `+${bassGain}dB` : `${bassGain}dB`}
              </span>
            </div>
            <input
              type="range"
              min="-12"
              max="12"
              value={bassGain}
              onChange={(e) => {
                audioEngine.resume();
                setActivePreset('custom');
                setBassGain(parseInt(e.target.value, 10));
              }}
              className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>

          {/* Treble Shelf */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-neutral-300 text-[11px]">
              <span>Treble EQ</span>
              <span className="font-mono text-[10px] text-neutral-400">
                {trebleGain > 0 ? `+${trebleGain}dB` : `${trebleGain}dB`}
              </span>
            </div>
            <input
              type="range"
              min="-12"
              max="12"
              value={trebleGain}
              onChange={(e) => {
                audioEngine.resume();
                setActivePreset('custom');
                setTrebleGain(parseInt(e.target.value, 10));
              }}
              className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* 6. What is this? Explainer Box */}
      <div className="p-3.5 bg-neutral-900/50 border border-neutral-800/60 rounded-xl space-y-1.5 text-neutral-400">
        <div className="flex items-center gap-1.5 font-semibold text-white text-xs">
          <Info className="w-3.5 h-3.5 text-neutral-400" />
          <span>What is this?</span>
        </div>
        <p className="text-[11px] leading-relaxed text-neutral-400">
          This grid simulates a spatial audio environment. Drag the listening source around and hear how the volume changes on each device. Works best in person.
        </p>
      </div>
    </div>
  );
}
