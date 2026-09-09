'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ExternalLink, AlertTriangle } from 'lucide-react';

interface YouTubePlayerProps {
  videoId: string;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  seekTime: number | null;
  unlockedTrigger?: number;
  onAutoplayBlocked?: () => void;
  onTimeUpdate: (current: number, duration: number) => void;
  onStateChange: (state: 'playing' | 'paused' | 'ended') => void;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: any;
  }
}

export function YouTubePlayer({
  videoId,
  isPlaying,
  volume,
  isMuted,
  seekTime,
  unlockedTrigger,
  onAutoplayBlocked,
  onTimeUpdate,
  onStateChange,
}: YouTubePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [isApiReady, setIsApiReady] = useState<boolean>(false);
  const [embedError, setEmbedError] = useState<string | null>(null);
  const timePollRef = useRef<any>(null);
  const lastStateChangeRef = useRef<'playing' | 'paused' | 'ended' | null>(null);
  const isInitialAutoplayBlockedRef = useRef<boolean>(true);

  // 1. Ensure YouTube Iframe API is loaded
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.YT && window.YT.Player) {
      setIsApiReady(true);
      return;
    }

    // Check if script tag is already in DOM
    const existingScript = document.getElementById('youtube-iframe-api');
    if (!existingScript) {
      const tag = document.createElement('script');
      tag.id = 'youtube-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }

    // Set callback or poll until YT.Player is available
    const prevCb = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevCb) prevCb();
      setIsApiReady(true);
    };

    const pollInterval = setInterval(() => {
      if (window.YT && window.YT.Player) {
        setIsApiReady(true);
        clearInterval(pollInterval);
      }
    }, 50);

    return () => clearInterval(pollInterval);
  }, []);

  // 2. Initialize player once API is ready
  useEffect(() => {
    if (!isApiReady || !videoId || !containerRef.current) return;

    setEmbedError(null);

    // If player instance exists, switch video
    if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
      try {
        playerRef.current.loadVideoById({
          videoId,
          startSeconds: 0,
        });
        if (isPlaying) {
          playerRef.current.playVideo();
        } else {
          playerRef.current.pauseVideo();
        }
      } catch (e) {
        console.warn('Failed to switch video on existing player', e);
      }
      return;
    }

    // Create unique element inside container
    const playerElement = document.createElement('div');
    playerElement.className = 'w-full h-full';
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(playerElement);

    try {
      const player = new window.YT.Player(playerElement, {
        videoId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          enablejsapi: 1,
          fs: 1,
          origin: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
        events: {
          onReady: (event: any) => {
            playerRef.current = event.target;
            const target = event.target;
            target.setVolume(isMuted ? 0 : volume);
            if (isMuted) {
              target.mute();
            } else {
              target.unMute();
            }
            if (isPlaying) {
              try {
                target.playVideo();
              } catch {
                try {
                  target.mute();
                  target.playVideo();
                  onAutoplayBlocked?.();
                } catch {}
              }
            }
            const dur = target.getDuration();
            if (dur > 0) {
              onTimeUpdate(0, dur);
            }
          },
          onStateChange: (event: any) => {
            // YT.PlayerState: -1 (UNSTARTED), 0 (ENDED), 1 (PLAYING), 2 (PAUSED), 3 (BUFFERING), 5 (CUED)
            if (event.data === 1) {
              isInitialAutoplayBlockedRef.current = false;
              if (lastStateChangeRef.current !== 'playing') {
                lastStateChangeRef.current = 'playing';
                onStateChange('playing');
              }
            } else if (event.data === 2) {
              // If we are supposed to be playing, but the browser halted unmuted autoplay upon mounting:
              if (isPlaying && isInitialAutoplayBlockedRef.current) {
                try {
                  event.target.mute();
                  event.target.playVideo();
                } catch {}
                onAutoplayBlocked?.();
                return;
              }
              if (lastStateChangeRef.current !== 'paused') {
                lastStateChangeRef.current = 'paused';
                onStateChange('paused');
              }
            } else if (event.data === 0) {
              if (lastStateChangeRef.current !== 'ended') {
                lastStateChangeRef.current = 'ended';
                onStateChange('ended');
              }
            }
          },
          onError: (event: any) => {
            console.error('YouTube player error:', event.data);
            if (event.data === 101 || event.data === 150) {
              setEmbedError('The owner of this video has restricted playback to YouTube only.');
            } else if (event.data === 100) {
              setEmbedError('The requested YouTube video was not found or has been removed.');
            } else {
              setEmbedError('Unable to play this YouTube video.');
            }
          },
        },
      });

      playerRef.current = player;
    } catch (err) {
      console.error('Failed to instantiate YouTube player:', err);
    }

    return () => {
      if (timePollRef.current) clearInterval(timePollRef.current);
    };
  }, [isApiReady, videoId]);

  // 3. React to isPlaying changes from HostelSync bottom bar
  useEffect(() => {
    if (!playerRef.current) return;
    try {
      const state = typeof playerRef.current.getPlayerState === 'function' ? playerRef.current.getPlayerState() : -1;
      if (isPlaying) {
        if (state !== 1 && typeof playerRef.current.playVideo === 'function') {
          playerRef.current.playVideo();
        }
      } else {
        if (state !== 2 && typeof playerRef.current.pauseVideo === 'function') {
          playerRef.current.pauseVideo();
        }
      }
    } catch {}
  }, [isPlaying]);

  // 4. React to volume & mute changes from HostelSync bottom bar
  useEffect(() => {
    if (!playerRef.current) return;
    try {
      if (isMuted) {
        if (typeof playerRef.current.mute === 'function') {
          playerRef.current.mute();
        }
      } else {
        if (typeof playerRef.current.unMute === 'function') {
          playerRef.current.unMute();
        }
        if (typeof playerRef.current.setVolume === 'function') {
          playerRef.current.setVolume(volume);
        }
      }
    } catch {}
  }, [volume, isMuted]);

  // 5. React to timeline seeking from HostelSync progress bar
  useEffect(() => {
    if (seekTime === null || !playerRef.current) return;
    try {
      if (typeof playerRef.current.seekTo === 'function') {
        playerRef.current.seekTo(seekTime, true);
      }
    } catch {}
  }, [seekTime]);

  // 6. React to user gesture audio unlock trigger (unmute & resume)
  useEffect(() => {
    if (!playerRef.current) return;
    try {
      isInitialAutoplayBlockedRef.current = false;
      if (!isMuted && typeof playerRef.current.unMute === 'function') {
        playerRef.current.unMute();
        playerRef.current.setVolume(volume);
      }
      if (isPlaying && typeof playerRef.current.playVideo === 'function') {
        playerRef.current.playVideo();
      }
    } catch {}
  }, [unlockedTrigger, isPlaying, isMuted, volume]);

  // 6. Polling playback time and duration to keep HostelSync bottom bar timeline in exact sync
  useEffect(() => {
    if (timePollRef.current) clearInterval(timePollRef.current);

    if (isPlaying) {
      timePollRef.current = setInterval(() => {
        if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
          try {
            const curr = playerRef.current.getCurrentTime() || 0;
            const dur = playerRef.current.getDuration() || 0;
            onTimeUpdate(curr, dur);
          } catch {}
        }
      }, 350);
    }

    return () => {
      if (timePollRef.current) clearInterval(timePollRef.current);
    };
  }, [isPlaying, onTimeUpdate]);

  return (
    <div className="w-full max-w-xl aspect-video rounded-xl overflow-hidden border border-neutral-800 bg-black shadow-2xl relative flex items-center justify-center">
      <div ref={containerRef} className="w-full h-full" />

      {/* Embedding restriction fallback */}
      {embedError && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-6 text-center z-20 backdrop-blur-xs">
          <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
          <p className="text-xs text-neutral-300 font-medium max-w-sm mb-3">
            {embedError}
          </p>
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-full flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>Open in YouTube</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
}
