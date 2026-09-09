'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  QrCode,
  Users,
  Search,
  MessageSquare,
  Compass,
  Headphones,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Volume2,
  VolumeX,
  Plus,
  Send,
  LogOut,
  Check,
  Copy,
  Music,
  Crown,
  Radio,
  X,
  Sparkles,
  Upload,
  Globe,
  Film,
  Laptop,
  Lock,
  Unlock,
  Pencil,
  UserMinus,
  Power,
  Shield,
  Disc,
  SlidersHorizontal,
} from 'lucide-react';
import { Hostel } from '@/lib/types';
import { HostelSyncLogo } from './HostelSyncLogo';
import { UploadAudioModal, AddedTrackData } from './UploadAudioModal';
import { RoomSync, Peer, SyncEvent } from '@/lib/sync';
import { getYouTubeVideoId, isYouTubeUrl, fetchYouTubeVideoInfo } from '@/lib/youtube';
import { RoomQrModal } from './RoomQrModal';
import { audioEngine } from '@/lib/audioEngine';
import { YouTubePlayer } from './YouTubePlayer';
import { SpatialAudioTab, SpatialFilterParams } from './SpatialAudioTab';

interface HostelRoomProps {
  hostel: Hostel;
  userName: string;
  isHost?: boolean;
  onLeave: () => void;
  onDeleteRoom?: () => void;
  onAddAnnouncement?: (title: string, content: string, tag: any) => void;
  onAddComplaint?: (title: string, category: any, room: string) => void;
}

export interface RealTrack {
  id: string;
  title: string;
  artist: string;
  duration: string;
  durationSeconds: number;
  addedBy: string;
  sourceType: 'device' | 'youtube' | 'soundcloud' | 'stream';
  url?: string;
  file?: File;
  youtubeId?: string | null;
}

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  time: string;
  isSelf: boolean;
}

export function HostelRoom({ hostel, userName, isHost = false, onLeave, onDeleteRoom }: HostelRoomProps) {
  // Audio & Sync References
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const syncRef = useRef<RoomSync | null>(null);
  const isSyncingFromRemote = useRef<boolean>(false);
  const lastAudioTimeRef = useRef<number>(-1);
  const [hasAudioUnlocked, setHasAudioUnlocked] = useState<boolean>(true);
  const [audioUnlockVersion, setAudioUnlockVersion] = useState<number>(0);
  const pendingPlayTrackIdRef = useRef<string | null>(null);

  // Permissions State (Real-time Synced across tabs/devices)
  const [playbackPermission, setPlaybackPermission] = useState<'everyone' | 'admins'>('everyone');
  const [addMusicPermission, setAddMusicPermission] = useState<'everyone' | 'admins'>('everyone');
  const [adminPeerIds, setAdminPeerIds] = useState<string[]>([]);
  const [promotedToAdmin, setPromotedToAdmin] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<'music' | 'studio' | 'room'>('music');

  // Room Name state
  const [currentRoomName, setCurrentRoomName] = useState<string>(hostel.name || 'Room');
  const [isEditingRoomName, setIsEditingRoomName] = useState<boolean>(false);
  const [editedRoomName, setEditedRoomName] = useState<string>(hostel.name || 'Room');

  // Room Lock state
  const [isRoomLocked, setIsRoomLocked] = useState<boolean>(Boolean(hostel.isLocked));

  // Kicked / Closed notices
  const [kickedNotice, setKickedNotice] = useState<string | null>(null);
  const [closedNotice, setClosedNotice] = useState<string | null>(null);

  const effectiveUserName = userName?.trim() || 'Resident';

  // True room host & Admin detection
  const isRoomHost = Boolean(
    isHost ||
    promotedToAdmin ||
    (typeof window !== 'undefined' && (
      sessionStorage.getItem(`hostelsync_creator_${hostel.code}`) === 'true' ||
      localStorage.getItem(`hostelsync_creator_${hostel.code}`) === 'true'
    )) ||
    (hostel.warden && effectiveUserName && hostel.warden.trim().toLowerCase() === effectiveUserName.trim().toLowerCase())
  );

  const isUserAdmin =
    isRoomHost ||
    (syncRef.current?.peerId ? adminPeerIds.includes(syncRef.current.peerId) : false);

  // References for unload & refresh listeners
  const connectedPeersRef = useRef<Peer[]>([]);
  const isUserAdminRef = useRef<boolean>(isUserAdmin);
  const playbackPermissionRef = useRef<'everyone' | 'admins'>(playbackPermission);
  const addMusicPermissionRef = useRef<'everyone' | 'admins'>(addMusicPermission);
  const adminPeerIdsRef = useRef<string[]>(adminPeerIds);
  const currentRoomNameRef = useRef<string>(currentRoomName);
  const isRoomLockedRef = useRef<boolean>(isRoomLocked);
  const handleRemoteSyncEventRef = useRef<(event: SyncEvent) => void>(() => {});
  const checkAndPromoteNextAdminRef = useRef<(peers: Peer[]) => void>(() => {});

  isUserAdminRef.current = isUserAdmin;
  playbackPermissionRef.current = playbackPermission;
  addMusicPermissionRef.current = addMusicPermission;
  adminPeerIdsRef.current = adminPeerIds;
  currentRoomNameRef.current = currentRoomName;
  isRoomLockedRef.current = isRoomLocked;

  const canControlPlayback = playbackPermission === 'everyone' || isUserAdmin;
  const canAddMusic = addMusicPermission === 'everyone' || isUserAdmin;

  const broadcastPermissions = (
    nextPlayback: 'everyone' | 'admins',
    nextAddMusic: 'everyone' | 'admins',
    nextAdmins: string[]
  ) => {
    if (syncRef.current) {
      syncRef.current.broadcast({
        type: 'PERMISSIONS_UPDATE',
        playbackPermission: nextPlayback,
        addMusicPermission: nextAddMusic,
        adminPeerIds: nextAdmins,
      });
    }
  };

  const handleTogglePlaybackPermission = (val: 'everyone' | 'admins') => {
    if (!isUserAdmin) return;
    setPlaybackPermission(val);
    playbackPermissionRef.current = val;
    broadcastPermissions(val, addMusicPermission, adminPeerIds);

    const chatNotification: ChatMessage = {
      id: `msg-perm-play-${Date.now()}`,
      sender: 'HostelSync',
      text: val === 'admins'
        ? '🔒 Playback controls (play/pause/skip) are now restricted to Admins only.'
        : '🔓 Playback controls are now open to Everyone.',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isSelf: false,
    };
    setMessages((prev) => [...prev, chatNotification]);
    if (syncRef.current) {
      syncRef.current.broadcast({
        type: 'CHAT_MESSAGE',
        message: chatNotification,
      });
    }
  };

  const handleToggleAddMusicPermission = (val: 'everyone' | 'admins') => {
    if (!isUserAdmin) return;
    setAddMusicPermission(val);
    addMusicPermissionRef.current = val;
    broadcastPermissions(playbackPermission, val, adminPeerIds);

    const chatNotification: ChatMessage = {
      id: `msg-perm-add-${Date.now()}`,
      sender: 'HostelSync',
      text: val === 'admins'
        ? '🔒 Music addition is now restricted to Admins only.'
        : '🔓 Music addition is now open to Everyone.',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isSelf: false,
    };
    setMessages((prev) => [...prev, chatNotification]);
    if (syncRef.current) {
      syncRef.current.broadcast({
        type: 'CHAT_MESSAGE',
        message: chatNotification,
      });
    }
  };

  const handleTogglePeerAdmin = (peerId: string) => {
    // Only the person who created the room has permission to create or toggle other admins
    if (!isRoomHost) return;
    const isNowAdmin = !adminPeerIds.includes(peerId);
    const nextAdmins = isNowAdmin
      ? [...adminPeerIds, peerId]
      : adminPeerIds.filter((id) => id !== peerId);
    setAdminPeerIds(nextAdmins);
    broadcastPermissions(playbackPermission, addMusicPermission, nextAdmins);

    const targetPeer = connectedPeers.find((p) => p.id === peerId);
    const targetName = targetPeer?.name || 'Resident';
    const chatNotification: ChatMessage = {
      id: `msg-adm-toggle-${Date.now()}`,
      sender: 'HostelSync',
      text: isNowAdmin
        ? `👑 ${targetName} was granted Admin permissions by room creator.`
        : `ℹ️ ${targetName} is no longer an Admin.`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isSelf: false,
    };
    setMessages((prev) => [...prev, chatNotification]);
    if (syncRef.current) {
      syncRef.current.broadcast({
        type: 'CHAT_MESSAGE',
        message: chatNotification,
      });
    }
  };

  // 1. Change Room Name (Creator Only)
  const handleSaveRoomName = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isRoomHost) return;
    const cleanName = editedRoomName.trim();
    if (!cleanName) return;

    setCurrentRoomName(cleanName);
    setIsEditingRoomName(false);
    hostel.name = cleanName;

    if (syncRef.current) {
      syncRef.current.broadcast({
        type: 'ROOM_NAME_UPDATED',
        newName: cleanName,
      });

      const chatNotification: ChatMessage = {
        id: `msg-name-${Date.now()}`,
        sender: 'HostelSync',
        text: `✏️ Room name was changed to "${cleanName}" by the creator.`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isSelf: false,
      };
      setMessages((prev) => [...prev, chatNotification]);
      syncRef.current.broadcast({
        type: 'CHAT_MESSAGE',
        message: chatNotification,
      });
    }

    try {
      fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: { ...hostel, name: cleanName } }),
      }).catch(() => {});
    } catch {}
  };

  // 2. Lock / Unlock Room (Creator Only)
  const handleToggleRoomLock = () => {
    if (!isRoomHost) return;
    const nextLocked = !isRoomLocked;
    setIsRoomLocked(nextLocked);
    hostel.isLocked = nextLocked;

    if (syncRef.current) {
      syncRef.current.broadcast({
        type: 'ROOM_LOCK_UPDATED',
        isLocked: nextLocked,
      });

      const chatNotification: ChatMessage = {
        id: `msg-lock-${Date.now()}`,
        sender: 'HostelSync',
        text: nextLocked
          ? '🔒 Room has been locked by the creator. New participants cannot join.'
          : '🔓 Room has been unlocked by the creator. Anyone with the code can join.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isSelf: false,
      };
      setMessages((prev) => [...prev, chatNotification]);
      syncRef.current.broadcast({
        type: 'CHAT_MESSAGE',
        message: chatNotification,
      });
    }

    try {
      fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: { ...hostel, isLocked: nextLocked } }),
      }).catch(() => {});
    } catch {}
  };

  // 3. Remove Participant / Kick (Creator Only)
  const handleKickParticipant = (peerId: string, peerName: string) => {
    if (!isRoomHost) return;
    if (typeof window !== 'undefined' && !window.confirm(`Remove "${peerName}" from the room?`)) {
      return;
    }

    setConnectedPeers((prev) => prev.filter((p) => p.id !== peerId));
    connectedPeersRef.current = connectedPeersRef.current.filter((p) => p.id !== peerId);

    if (syncRef.current) {
      syncRef.current.broadcast({
        type: 'PEER_KICKED',
        targetPeerId: peerId,
        memberName: peerName,
      });

      const chatNotification: ChatMessage = {
        id: `msg-kick-${Date.now()}`,
        sender: 'HostelSync',
        text: `🚫 ${peerName} was removed from the room by the creator.`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isSelf: false,
      };
      setMessages((prev) => [...prev, chatNotification]);
      syncRef.current.broadcast({
        type: 'CHAT_MESSAGE',
        message: chatNotification,
      });
    }

    try {
      fetch('/api/rooms/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: hostel.code,
          peerId,
          action: 'leave',
        }),
      }).catch(() => {});
    } catch {}
  };

  // 4. Close Room (Creator Only)
  const handleCloseRoom = () => {
    if (!isRoomHost) return;
    if (typeof window !== 'undefined' && !window.confirm('Are you sure you want to close this room? All participants will be disconnected.')) {
      return;
    }

    if (syncRef.current) {
      syncRef.current.broadcast({
        type: 'ROOM_DELETED',
        roomCode: hostel.code,
        reason: 'The room was closed by the creator.',
      });
    }

    try {
      sessionStorage.removeItem(`hostelsync_creator_${hostel.code}`);
      localStorage.removeItem(`hostelsync_creator_${hostel.code}`);
      localStorage.removeItem('hostelsync_active_code_v1');
    } catch {}

    try {
      fetch(`/api/rooms?code=${encodeURIComponent(hostel.code)}`, {
        method: 'DELETE',
      }).catch(() => {});
    } catch {}

    if (onDeleteRoom) {
      onDeleteRoom();
    } else {
      onLeave();
    }
  };

  // User leaves or refreshes: announce leave, do NOT delete room so other members can join anytime
  const handleLeaveOrRefresh = useCallback(() => {
    const peers = connectedPeersRef.current;
    const amAdmin = isUserAdminRef.current;

    if (amAdmin && peers.length > 0 && syncRef.current) {
      // Transfer admin to the member next in line deterministically by join time
      const sortedPeers = [...peers].sort((a, b) => {
        const timeA = a.joinedAt || 0;
        const timeB = b.joinedAt || 0;
        if (timeA !== timeB) return timeA - timeB;
        return a.id.localeCompare(b.id);
      });
      const nextAdmin = sortedPeers[0];
      syncRef.current.broadcast({
        type: 'ADMIN_TRANSFER',
        newAdminPeerId: nextAdmin.id,
        newAdminName: nextAdmin.name,
      });
      syncRef.current.broadcast({
        type: 'PERMISSIONS_UPDATE',
        playbackPermission: playbackPermissionRef.current,
        addMusicPermission: addMusicPermissionRef.current,
        adminPeerIds: [nextAdmin.id, nextAdmin.name.toLowerCase()],
      });
    }

    if (syncRef.current) {
      syncRef.current.broadcast({
        type: 'PEER_LEAVE',
        peerId: syncRef.current.peerId,
      });
    }

    // Always clear active session so refresh lands back on the clean home screen
    try {
      localStorage.removeItem('hostelsync_active_code_v1');
    } catch {}
  }, []);

  const [rightTab, setRightTab] = useState<'chat' | 'spatial'>('chat');
  const [showQrModal, setShowQrModal] = useState(false);
  const [showAddTrackModal, setShowAddTrackModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Real Multi-Device Peers State (no fake users)
  const [connectedPeers, setConnectedPeers] = useState<Peer[]>([]);
  const [liveRtt, setLiveRtt] = useState<number>(1.2);
  const [liveOffset, setLiveOffset] = useState<number>(0);

  // Audio Player State (Real HTML5 Audio & YouTube)
  const [tracks, setTracks] = useState<RealTrack[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(80);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [isRepeat, setIsRepeat] = useState<boolean>(true);
  const [isMetronomeActive, setIsMetronomeActive] = useState<boolean>(false);
  const [metronomeBeat, setMetronomeBeat] = useState<number>(0);
  const [externalSeekTime, setExternalSeekTime] = useState<number | null>(null);

  // Real Spatial Audio Modulation State
  const [spatialCombinedScale, setSpatialCombinedScale] = useState<number>(1.0);

  const handleSpatialChange = useCallback((params: SpatialFilterParams) => {
    const combined = (params.volumeMultiplier || 1.0) * (params.presetVolumeScale || 1.0);
    setSpatialCombinedScale((prev) => (Math.abs(prev - combined) >= 0.01 ? combined : prev));
  }, []);

  const effectiveVolume = Math.max(
    0,
    Math.min(100, Math.round(volume * spatialCombinedScale))
  );

  // Chat State (Starts completely clean with 0 fake messages)
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Search input
  const [searchQuery, setSearchQuery] = useState('');

  const activeTrack = tracks[currentTrackIndex] || null;

  const tracksRef = useRef<RealTrack[]>(tracks);
  const currentTrackIndexRef = useRef<number>(currentTrackIndex);
  const currentTimeRef = useRef<number>(currentTime);
  const isPlayingRef = useRef<boolean>(isPlaying);
  const activeTrackRef = useRef<RealTrack | null>(activeTrack);

  tracksRef.current = tracks;
  currentTrackIndexRef.current = currentTrackIndex;
  currentTimeRef.current = currentTime;
  isPlayingRef.current = isPlaying;
  activeTrackRef.current = activeTrack;

  // Initialize Real Synchronization Channel
  useEffect(() => {
    const sync = new RoomSync(hostel.code, effectiveUserName, isRoomHost);
    syncRef.current = sync;

    // Ensure room is registered on server and cloud KV for other devices
    if (isRoomHost) {
      fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: hostel }),
      }).catch(() => {});
    }

    sync.setEventHandler((event: SyncEvent) => {
      handleRemoteSyncEventRef.current(event);
    });

    // Receive incoming live WebRTC audio stream from host/peers
    sync.onStream((incomingStream) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = incomingStream;
        audioEngine.unlockAudio();
        audioEngine.resume();
        remoteAudioRef.current.play().then(() => {
          setHasAudioUnlocked(true);
        }).catch(() => {
          setHasAudioUnlocked(false);
        });
      }
    });

    // Receive incoming audio file buffer over WebRTC DataChannel
    sync.onFile((fileData) => {
      try {
        const blob = new Blob([fileData.buffer], { type: fileData.type || 'audio/mpeg' });
        const localBlobUrl = URL.createObjectURL(blob);

        setTracks((prev) => {
          const exists = prev.find((t) => t.id === fileData.trackId);
          let nextList: RealTrack[];
          if (exists) {
            nextList = prev.map((t) => (t.id === fileData.trackId ? { ...t, url: localBlobUrl } : t));
          } else {
            const receivedTrack: RealTrack = {
              id: fileData.trackId,
              title: fileData.title,
              artist: fileData.artist,
              duration: fileData.duration,
              durationSeconds: fileData.durationSeconds,
              addedBy: fileData.addedBy || 'Peer',
              sourceType: 'device',
              url: localBlobUrl,
            };
            nextList = [...prev, receivedTrack];
          }
          return nextList;
        });

        // If room is currently playing this track, start playback automatically
        if (isPlayingRef.current) {
          audioEngine.unlockAudio();
          audioEngine.resume();
          if (audioRef.current) {
            audioRef.current.play().then(() => {
              setHasAudioUnlocked(true);
            }).catch(() => {
              setHasAudioUnlocked(false);
            });
          }
        }
      } catch (err) {
        console.warn('Error unpacking received audio file:', err);
      }
    });

    // Preload YouTube Iframe API script early for instant link playback
    if (typeof window !== 'undefined' && !document.getElementById('youtube-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'youtube-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }

    // Clock calibration interval, stale peer cleanup, and periodic playback time-lock
    let syncTickCount = 0;
    const statsInterval = setInterval(() => {
      setLiveRtt(sync.measuredRtt);
      setLiveOffset(sync.measuredOffset);

      // Periodic time lock sync: Admin broadcasts current time every 2.5s so peers stay in sync without network flood
      syncTickCount++;
      if (syncTickCount % 2 === 0 && isUserAdminRef.current && isPlayingRef.current) {
        const currentLiveTime = audioRef.current?.currentTime ?? currentTimeRef.current;
        sync.broadcast({
          type: 'AUDIO_SEEK',
          currentTime: currentLiveTime,
          isManual: false,
          sentAt: Date.now(),
        });
      }

      // Clean up stale peers older than 12 seconds and automatically promote successor if creator disconnected
      const now = performance.now();
      setConnectedPeers((prev) => {
        const alive = prev.filter((p) => now - p.lastSeen < 12000);
        connectedPeersRef.current = alive;
        checkAndPromoteNextAdminRef.current(alive);
        return alive;
      });
    }, 1250);

    return () => {
      clearInterval(statsInterval);
      sync.close();
    };
  }, [hostel.code, effectiveUserName]);

  // Global user interaction listener: unlocks Web Audio permissions on first touch/click
  useEffect(() => {
    const handleInteraction = () => {
      audioEngine.unlockAudio();
      audioEngine.resume();
      setAudioUnlockVersion((v) => v + 1);
      if (isPlayingRef.current) {
        if (audioRef.current && audioRef.current.src) {
          audioRef.current.play().catch(() => {});
        }
        if (remoteAudioRef.current && remoteAudioRef.current.srcObject) {
          remoteAudioRef.current.play().catch(() => {});
        }
      }
      setHasAudioUnlocked(true);
    };

    window.addEventListener('click', handleInteraction, { passive: true });
    window.addEventListener('touchstart', handleInteraction, { passive: true });
    window.addEventListener('keydown', handleInteraction, { passive: true });

    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, []);

  // Attach window refresh / unload listener to transfer admin or delete empty room instantly on tab close/refresh
  useEffect(() => {
    const onBeforeUnload = () => {
      handleLeaveOrRefresh();
    };

    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [handleLeaveOrRefresh]);

  // Instantly re-ping and re-sync whenever mobile screen wakes up or tab returns to visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && syncRef.current) {
        syncRef.current.broadcast({
          type: 'PEER_PING',
          peerId: syncRef.current.peerId,
          name: effectiveUserName,
          isHost: isRoomHost,
          timestamp: performance.now(),
        });
        if (!isUserAdminRef.current) {
          syncRef.current.broadcast({
            type: 'REQUEST_ROOM_STATE',
            peerId: syncRef.current.peerId,
          });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [effectiveUserName, isRoomHost]);

  // Deterministic automatic admin promotion when creator / active admin disconnects
  const checkAndPromoteNextAdmin = (currentPeers: Peer[]) => {
    const myPeerId = syncRef.current?.peerId;
    if (!myPeerId) return;

    // 1. Gather all currently alive participants (self + alive remote peers)
    const selfMember: Peer = {
      id: myPeerId,
      name: effectiveUserName,
      isHost: isRoomHost,
      isAdmin: isUserAdminRef.current,
      lastSeen: performance.now(),
      deviceType: 'Current Browser',
      joinedAt: syncRef.current?.joinedAt || Date.now(),
    };

    const allAlive: Peer[] = [selfMember, ...currentPeers];

    // 2. Check if an active host or admin is currently present in the room
    const hasActiveHost = allAlive.some((p) => p.isHost && (p.id === myPeerId ? isRoomHost : true));
    const hasActiveAdmin = allAlive.some(
      (p) => (p.isAdmin || adminPeerIdsRef.current.includes(p.id)) && (p.id === myPeerId ? isUserAdminRef.current : true)
    );

    // If an active creator or admin is still present, no succession is needed
    if (hasActiveHost || hasActiveAdmin) return;

    // 3. Creator/Admin has disconnected! Find the member next in line deterministically
    // Sort all alive members by join timestamp ascending (earliest joined member gets admin)
    const sortedAlive = [...allAlive].sort((a, b) => {
      const timeA = a.joinedAt || 0;
      const timeB = b.joinedAt || 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.id.localeCompare(b.id);
    });

    const nextAdmin = sortedAlive[0];
    if (!nextAdmin) return;

    // 4. If this client is the successor, take over as Admin
    if (nextAdmin.id === myPeerId) {
      setPromotedToAdmin(true);
      const nextAdmins = [myPeerId];
      setAdminPeerIds(nextAdmins);
      adminPeerIdsRef.current = nextAdmins;
      isUserAdminRef.current = true;

      if (syncRef.current) {
        syncRef.current.broadcast({
          type: 'ADMIN_TRANSFER',
          newAdminPeerId: myPeerId,
          newAdminName: effectiveUserName,
        });
        syncRef.current.broadcast({
          type: 'PERMISSIONS_UPDATE',
          playbackPermission: playbackPermissionRef.current,
          addMusicPermission: addMusicPermissionRef.current,
          adminPeerIds: nextAdmins,
        });
      }

      const chatNotification: ChatMessage = {
        id: `msg-succ-${Date.now()}`,
        sender: 'HostelSync',
        text: `👑 Creator disconnected. ${effectiveUserName} is now the Admin of this room!`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isSelf: false,
      };
      setMessages((msgs) => [...msgs, chatNotification]);
      if (syncRef.current) {
        syncRef.current.broadcast({
          type: 'CHAT_MESSAGE',
          message: chatNotification,
        });
      }
    } else {
      // Another peer is next in line: mark them as the expected admin locally
      const nextAdmins = [nextAdmin.id];
      setAdminPeerIds(nextAdmins);
      adminPeerIdsRef.current = nextAdmins;
    }
  };

  checkAndPromoteNextAdminRef.current = checkAndPromoteNextAdmin;

  // Handle incoming real-time events from other tabs / devices
  const handleRemoteSyncEvent = (event: SyncEvent) => {
    switch (event.type) {
      case 'ADMIN_TRANSFER': {
        const myId = syncRef.current?.peerId;
        const myName = effectiveUserName.toLowerCase();
        const isMe = event.newAdminPeerId === myId || event.newAdminName.toLowerCase() === myName;

        if (isMe) {
          setPromotedToAdmin(true);
          isUserAdminRef.current = true;
        }
        setAdminPeerIds([event.newAdminPeerId]);
        adminPeerIdsRef.current = [event.newAdminPeerId];

        setMessages((prev) => [
          ...prev,
          {
            id: `msg-adm-${Date.now()}`,
            sender: 'HostelSync',
            text: isMe
              ? '👑 You are now the Admin of this room!'
              : `👑 Admin role transferred to ${event.newAdminName}`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isSelf: false,
          },
        ]);
        break;
      }
      case 'ROOM_DELETED': {
        onDeleteRoom?.();
        onLeave();
        break;
      }
      case 'ROOM_STATE_SYNC': {
        // Only ignore if this instance is the room host AND already has an active queue of tracks
        if (isRoomHost && tracksRef.current.length > 0) break;

        setPlaybackPermission(event.playbackPermission);
        setAddMusicPermission(event.addMusicPermission);
        setAdminPeerIds(event.adminPeerIds || []);

        if (event.roomName) {
          setCurrentRoomName(event.roomName);
          setEditedRoomName(event.roomName);
          hostel.name = event.roomName;
        }
        if (event.isLocked !== undefined) {
          setIsRoomLocked(Boolean(event.isLocked));
          hostel.isLocked = Boolean(event.isLocked);
        }

        if (Array.isArray(event.tracks) && event.tracks.length > 0) {
          setTracks((prev) => {
            return event.tracks.map((rt) => {
              const localMatch = prev.find((p) => p.id === rt.id && p.url);
              return localMatch ? { ...rt, url: localMatch.url, file: localMatch.file } : rt;
            });
          });
        }

        if (typeof event.currentTrackIndex === 'number') {
          setCurrentTrackIndex(event.currentTrackIndex);
        }

        const sentTime = event.sentAt || event.serverTimestamp;
        let networkDelay = 0;
        if (sentTime && Math.abs(Date.now() - sentTime) < 10000) {
          networkDelay = Math.max(0, (Date.now() - sentTime) / 1000);
        } else {
          networkDelay = Math.max(0.01, (syncRef.current?.measuredRtt || 60) / 2000);
        }
        networkDelay = Math.min(2.0, networkDelay);
        const targetTime = (event.currentTime || 0) + networkDelay;
        setCurrentTime(targetTime);
        setExternalSeekTime(targetTime);

        if (event.isPlaying) {
          setIsPlaying(true);
          audioEngine.unlockAudio();
          audioEngine.resume();
          setAudioUnlockVersion((v) => v + 1);
          if (audioRef.current && audioRef.current.src) {
            audioRef.current.currentTime = targetTime;
            audioRef.current.playbackRate = 1.0;
            audioRef.current.play().then(() => {
              setHasAudioUnlocked(true);
            }).catch(() => {
              setHasAudioUnlocked(false);
            });
            // Stop remote WebRTC stream to eliminate delayed double echo
            if (remoteAudioRef.current) {
              remoteAudioRef.current.pause();
              remoteAudioRef.current.volume = 0;
            }
          } else if (remoteAudioRef.current && remoteAudioRef.current.srcObject) {
            remoteAudioRef.current.play().then(() => {
              setHasAudioUnlocked(true);
            }).catch(() => {
              setHasAudioUnlocked(false);
            });
          }
        } else {
          setIsPlaying(false);
          if (audioRef.current) audioRef.current.pause();
          if (remoteAudioRef.current) remoteAudioRef.current.pause();
        }
        break;
      }
      case 'REQUEST_ROOM_STATE': {
        // When a peer requests state, the admin broadcasts the room queue and playback position
        if (isUserAdminRef.current && syncRef.current) {
          syncRef.current.broadcast({
            type: 'ROOM_STATE_SYNC',
            tracks: tracksRef.current.map((t) => ({
              ...t,
              file: undefined,
              url: t.sourceType === 'device' ? undefined : t.url,
            })),
            currentTrackIndex: currentTrackIndexRef.current,
            isPlaying: isPlayingRef.current,
            currentTime: audioRef.current?.currentTime ?? currentTimeRef.current,
            serverTimestamp: Date.now(),
            sentAt: Date.now(),
            playbackPermission: playbackPermissionRef.current,
            addMusicPermission: addMusicPermissionRef.current,
            adminPeerIds: adminPeerIdsRef.current,
            roomName: currentRoomNameRef.current,
            isLocked: isRoomLockedRef.current,
          });

          // Also re-send audio buffer if the current track is a local file
          const curTrk = tracksRef.current[currentTrackIndexRef.current];
          if (curTrk?.file && syncRef.current) {
            curTrk.file.arrayBuffer().then((buf) => {
              syncRef.current?.broadcastFile({
                trackId: curTrk.id,
                title: curTrk.title,
                artist: curTrk.artist,
                duration: curTrk.duration,
                durationSeconds: curTrk.durationSeconds,
                addedBy: curTrk.addedBy,
                buffer: buf,
                type: curTrk.file?.type || 'audio/mpeg',
              });
            }).catch(() => {});
          }
        }
        break;
      }
      case 'PEER_PING': {
        setConnectedPeers((prev) => {
          const exists = prev.find((p) => p.id === event.peerId);
          let nextList: Peer[];
          if (exists) {
            nextList = prev.map((p) =>
              p.id === event.peerId
                ? {
                    ...p,
                    name: event.name,
                    isHost: event.isHost,
                    joinedAt: event.joinedAt || p.joinedAt || Date.now(),
                    lastSeen: performance.now(),
                  }
                : p
            );
          } else {
            nextList = [
              ...prev,
              {
                id: event.peerId,
                name: event.name,
                isHost: event.isHost,
                joinedAt: event.joinedAt || Date.now(),
                lastSeen: performance.now(),
                deviceType: 'Desktop Browser',
              },
            ];
          }
          connectedPeersRef.current = nextList;
          return nextList;
        });
        break;
      }
      case 'PEER_PONG': {
        setConnectedPeers((prev) => {
          const exists = prev.find((p) => p.id === event.peerId);
          let nextList: Peer[];
          if (exists) {
            nextList = prev.map((p) =>
              p.id === event.peerId
                ? {
                    ...p,
                    name: event.name || p.name,
                    isHost: event.isHost !== undefined ? event.isHost : p.isHost,
                    joinedAt: event.joinedAt || p.joinedAt || Date.now(),
                    lastSeen: performance.now(),
                  }
                : p
            );
          } else {
            nextList = [
              ...prev,
              {
                id: event.peerId,
                name: event.name || 'Room Member',
                isHost: Boolean(event.isHost),
                joinedAt: event.joinedAt || Date.now(),
                lastSeen: performance.now(),
                deviceType: 'Desktop Browser',
              },
            ];
          }
          connectedPeersRef.current = nextList;
          return nextList;
        });
        break;
      }
      case 'PERMISSIONS_UPDATE': {
        setPlaybackPermission(event.playbackPermission);
        setAddMusicPermission(event.addMusicPermission);
        setAdminPeerIds(event.adminPeerIds || []);
        break;
      }
      case 'PEER_LEAVE': {
        setConnectedPeers((prev) => {
          const remaining = prev.filter((p) => p.id !== event.peerId);
          connectedPeersRef.current = remaining;
          checkAndPromoteNextAdmin(remaining);
          return remaining;
        });
        break;
      }
      case 'TRACK_UPDATE': {
        setTracks((prev) =>
          prev.map((t) =>
            t.id === event.trackId
              ? { ...t, title: event.title, artist: event.artist }
              : t
          )
        );
        break;
      }
      case 'AUDIO_PLAY': {
        isSyncingFromRemote.current = true;
        setIsPlaying(true);
        audioEngine.unlockAudio();
        audioEngine.resume();
        setAudioUnlockVersion((v) => v + 1);

        if (event.trackId) {
          pendingPlayTrackIdRef.current = event.trackId;
          setTracks((prev) => {
            const idx = prev.findIndex((t) => t.id === event.trackId);
            if (idx !== -1) {
              pendingPlayTrackIdRef.current = null;
              if (idx !== currentTrackIndexRef.current) {
                setCurrentTrackIndex(idx);
              }
            }
            return prev;
          });
        }

        const sentTime = event.sentAt || event.serverTimestamp;
        let networkDelay = 0;
        if (sentTime && Math.abs(Date.now() - sentTime) < 10000) {
          networkDelay = Math.max(0, (Date.now() - sentTime) / 1000);
        } else {
          networkDelay = Math.max(0.01, (syncRef.current?.measuredRtt || 60) / 2000);
        }
        networkDelay = Math.min(2.0, networkDelay);
        const targetTime = event.currentTime + networkDelay;

        setCurrentTime(targetTime);
        setExternalSeekTime(targetTime);

        if (audioRef.current && audioRef.current.src) {
          if (Math.abs(audioRef.current.currentTime - targetTime) > 0.35) {
            audioRef.current.currentTime = targetTime;
          }
          audioRef.current.playbackRate = 1.0;
          audioRef.current.play().then(() => {
            setHasAudioUnlocked(true);
          }).catch(() => {
            setHasAudioUnlocked(false);
          });
          // Avoid duplicate delayed stream playback when local audio file is playing
          if (remoteAudioRef.current) {
            remoteAudioRef.current.pause();
            remoteAudioRef.current.volume = 0;
          }
        } else if (remoteAudioRef.current && remoteAudioRef.current.srcObject) {
          remoteAudioRef.current.play().then(() => {
            setHasAudioUnlocked(true);
          }).catch(() => {
            setHasAudioUnlocked(false);
          });
        }

        setTimeout(() => {
          isSyncingFromRemote.current = false;
        }, 1500);
        break;
      }
      case 'AUDIO_PAUSE': {
        isSyncingFromRemote.current = true;
        setIsPlaying(false);
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.playbackRate = 1.0;
        }
        if (remoteAudioRef.current) {
          remoteAudioRef.current.pause();
        }
        if (typeof event.currentTime === 'number') {
          setCurrentTime(event.currentTime);
          setExternalSeekTime(event.currentTime);
        }
        setTimeout(() => {
          isSyncingFromRemote.current = false;
        }, 100);
        break;
      }
      case 'AUDIO_SEEK': {
        if (!isUserAdminRef.current) {
          const sentTime = event.sentAt;
          let latency = 0;
          if (sentTime && Math.abs(Date.now() - sentTime) < 10000) {
            latency = Math.max(0, (Date.now() - sentTime) / 1000);
          } else {
            latency = Math.max(0.01, (syncRef.current?.measuredRtt || 60) / 2000);
          }
          latency = Math.min(1.5, latency);
          const targetTime = event.currentTime + latency;
          const currentLocalTime = audioRef.current?.currentTime ?? currentTimeRef.current;
          const diff = targetTime - currentLocalTime;
          const drift = Math.abs(diff);

          if (event.isManual) {
            // User explicitly scrubbed timeline: immediate hard seek
            if (audioRef.current && activeTrackRef.current?.sourceType !== 'youtube') {
              audioRef.current.currentTime = event.currentTime;
              audioRef.current.playbackRate = 1.0;
            }
            setExternalSeekTime(event.currentTime);
            setCurrentTime(event.currentTime);
          } else {
            // Periodic background sync: smooth clock nudge, zero stutter
            if (activeTrackRef.current?.sourceType === 'youtube') {
              if (drift > 2.0) {
                setExternalSeekTime(targetTime);
                setCurrentTime(targetTime);
              }
            } else if (audioRef.current) {
              if (drift < 0.15) {
                // In sync: ensure normal playback rate
                if (audioRef.current.playbackRate !== 1.0) {
                  audioRef.current.playbackRate = 1.0;
                }
              } else if (drift <= 1.5) {
                // Gently nudge rate to catch up or wait up without audible pause/stutter
                if (diff > 0) {
                  audioRef.current.playbackRate = 1.04;
                } else {
                  audioRef.current.playbackRate = 0.96;
                }
              } else {
                // Drift is large (>1.5s): hard seek to snap back into sync
                audioRef.current.currentTime = targetTime;
                audioRef.current.playbackRate = 1.0;
                setExternalSeekTime(targetTime);
                setCurrentTime(targetTime);
              }
            }
          }
        }
        break;
      }
      case 'QUEUE_ADD': {
        // Enforce permission: reject if room is locked to admins and sender is not an admin
        if (addMusicPermissionRef.current === 'admins' && !event.isAdmin) {
          console.warn('Rejected QUEUE_ADD from non-admin peer');
          break;
        }
        setTracks((prev) => {
          const already = prev.find((t) => t.id === event.track.id);
          if (already) return prev;
          const next = [...prev, event.track];
          // Auto-start playback if queue was empty or if this track was requested to play
          if (prev.length === 0 || pendingPlayTrackIdRef.current === event.track.id) {
            setCurrentTrackIndex(prev.length === 0 ? 0 : next.length - 1);
            setCurrentTime(0);
            setExternalSeekTime(0);
            setIsPlaying(true);
            audioEngine.unlockAudio();
            audioEngine.resume();
            setAudioUnlockVersion((v) => v + 1);
            pendingPlayTrackIdRef.current = null;
          }
          return next;
        });
        break;
      }
      case 'QUEUE_CLEAR': {
        if (!event.isAdmin && !isUserAdminRef.current) {
          console.warn('Rejected QUEUE_CLEAR from non-admin peer');
          break;
        }
        setTracks([]);
        setIsPlaying(false);
        break;
      }
      case 'PEER_KICKED': {
        if (event.targetPeerId === syncRef.current?.peerId) {
          if (audioRef.current) audioRef.current.pause();
          if (remoteAudioRef.current) remoteAudioRef.current.pause();
          setIsPlaying(false);
          setKickedNotice('You have been removed from this room by the creator.');
          setTimeout(() => {
            onLeave();
          }, 2500);
        } else {
          setConnectedPeers((prev) => prev.filter((p) => p.id !== event.targetPeerId));
          connectedPeersRef.current = connectedPeersRef.current.filter((p) => p.id !== event.targetPeerId);
        }
        break;
      }
      case 'ROOM_DELETED': {
        if (audioRef.current) audioRef.current.pause();
        if (remoteAudioRef.current) remoteAudioRef.current.pause();
        setIsPlaying(false);
        setClosedNotice(event.reason || 'This room was closed by the creator.');
        setTimeout(() => {
          onLeave();
        }, 2500);
        break;
      }
      case 'ROOM_NAME_UPDATED': {
        if (event.newName) {
          setCurrentRoomName(event.newName);
          setEditedRoomName(event.newName);
          hostel.name = event.newName;
        }
        break;
      }
      case 'ROOM_LOCK_UPDATED': {
        setIsRoomLocked(Boolean(event.isLocked));
        hostel.isLocked = Boolean(event.isLocked);
        break;
      }
      case 'CHAT_MESSAGE': {
        setMessages((prev) => [...prev, { ...event.message, isSelf: false }]);
        setTimeout(() => {
          chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
        break;
      }
    }
  };

  // Keep the ref always pointing to the latest handler (critical for event dispatching)
  handleRemoteSyncEventRef.current = handleRemoteSyncEvent;

  // Real Audio Event Listeners with throttled time updates
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (!audio || isNaN(audio.currentTime)) return;
      const t = audio.currentTime;
      if (Math.abs(t - lastAudioTimeRef.current) >= 0.25) {
        lastAudioTimeRef.current = t;
        setCurrentTime(t);
      }
    };

    const handleLoadedMetadata = () => {
      if (audio && audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      if (tracks.length > 1) {
        handleNextTrack();
      } else if (isRepeat) {
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
        }
        setCurrentTime(0);
      } else {
        setIsPlaying(false);
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [currentTrackIndex, tracks.length, isRepeat]);

  // Connect real HTML5 audio to Web Audio filters pipeline
  useEffect(() => {
    if (audioRef.current && activeTrack?.url && activeTrack?.sourceType !== 'youtube') {
      audioEngine.attachMediaElement(audioRef.current);
    }
  }, [activeTrack]);

  // Sync volume with real audio
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  // Sync play/pause with real HTML5 audio
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeTrack?.url || activeTrack?.sourceType === 'youtube') return;

    if (isPlaying) {
      audioEngine.resume();
      if (currentTimeRef.current > 0 && Math.abs(audio.currentTime - currentTimeRef.current) > 0.5) {
        audio.currentTime = currentTimeRef.current;
      }
      audio.play().then(() => {
        setHasAudioUnlocked(true);
        if (isUserAdminRef.current && syncRef.current) {
          audioEngine.attachMediaElement(audio);
          const liveStream = audioEngine.getOutputStream();
          if (liveStream) {
            syncRef.current.streamAudio(liveStream);
          }
        }
      }).catch((err) => {
        console.warn('HTML5 audio play blocked by browser:', err);
        setHasAudioUnlocked(false);
      });
    } else {
      audio.pause();
    }
  }, [isPlaying, activeTrack, audioUnlockVersion]);

  // Sync play/pause with remote live WebRTC stream (only when no local audio file is playing)
  useEffect(() => {
    const remoteAudio = remoteAudioRef.current;
    if (!remoteAudio) return;

    const hasLocalAudio = Boolean(activeTrack?.url && activeTrack.sourceType !== 'youtube');
    if (hasLocalAudio) {
      remoteAudio.pause();
      remoteAudio.volume = 0;
      return;
    }

    if (!remoteAudio.srcObject) return;

    if (isPlaying) {
      audioEngine.resume();
      remoteAudio.volume = isMuted ? 0 : volume / 100;
      remoteAudio.play().catch(() => {});
    } else {
      remoteAudio.pause();
    }
  }, [isPlaying, activeTrack?.url, activeTrack?.sourceType, volume, isMuted]);

  // Keep HTML5 audio playing even when tab is in background/hidden
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibility = () => {
      if (!isPlaying) return;

      // Resume local HTML5 audio if it was paused by the browser
      const audio = audioRef.current;
      if (audio && audio.src && activeTrack?.sourceType !== 'youtube') {
        if (audio.paused) {
          audio.play().catch(() => {});
        }
      }

      // Resume remote WebRTC audio stream if it was paused
      const remoteAudio = remoteAudioRef.current;
      if (remoteAudio && remoteAudio.srcObject && remoteAudio.paused) {
        remoteAudio.play().catch(() => {});
      }

      // Ensure Web Audio context is resumed
      audioEngine.resume();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isPlaying, activeTrack?.sourceType]);

  const toggleMetronome = () => {
    const next = audioEngine.toggleMetronome((beat) => {
      setMetronomeBeat(beat);
    });
    setIsMetronomeActive(next);
  };

  useEffect(() => {
    return () => {
      audioEngine.stopMetronome();
    };
  }, []);

  // Timer interval fallback ONLY when no real native audio element or YouTube player is timing
  useEffect(() => {
    let interval: any = null;
    if (isPlaying && activeTrack && activeTrack.sourceType !== 'youtube' && !audioRef.current?.src) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          const trackDur = activeTrack?.durationSeconds || 225;
          if (prev >= trackDur) {
            if (isRepeat) {
              return 0;
            } else {
              handleNextTrack();
              return 0;
            }
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, activeTrack?.id, activeTrack?.sourceType, isRepeat]);

  const togglePlay = () => {
    if (!canControlPlayback) return;
    if (tracks.length === 0) {
      if (canAddMusic) setShowAddTrackModal(true);
      return;
    }

    const nextState = !isPlaying;
    setIsPlaying(nextState);

    const hasLocalAudio = Boolean(audioRef.current && activeTrack?.url && activeTrack.sourceType !== 'youtube');

    if (nextState) {
      audioEngine.playAmbientChord(volume);
      if (hasLocalAudio && audioRef.current) {
        audioRef.current.playbackRate = 1.0;
        audioRef.current.play().catch(() => {});
        audioEngine.attachMediaElement(audioRef.current);
        const liveStream = audioEngine.getOutputStream();
        if (liveStream && syncRef.current) {
          syncRef.current.streamAudio(liveStream);
        }
      } else if (remoteAudioRef.current && remoteAudioRef.current.srcObject) {
        remoteAudioRef.current.play().catch(() => {});
      }
    } else {
      if (audioRef.current && activeTrack?.sourceType !== 'youtube') {
        audioRef.current.pause();
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.pause();
      }
    }

    // Broadcast play/pause to other connected devices/tabs
    if (!isSyncingFromRemote.current && syncRef.current) {
      if (nextState) {
        syncRef.current.broadcast({
          type: 'AUDIO_PLAY',
          trackId: activeTrack?.id || '',
          currentTime: currentTime,
          sentAt: Date.now(),
          serverTimestamp: Date.now(),
        });
      } else {
        syncRef.current.broadcast({
          type: 'AUDIO_PAUSE',
          trackId: activeTrack?.id || '',
          currentTime: currentTime,
          sentAt: Date.now(),
        });
      }
    }
  };

  const handleNextTrack = () => {
    if (!canControlPlayback) return;
    if (tracks.length === 0) return;
    let nextIdx: number;
    if (isShuffle && tracks.length > 1) {
      nextIdx = Math.floor(Math.random() * tracks.length);
      while (nextIdx === currentTrackIndex) {
        nextIdx = Math.floor(Math.random() * tracks.length);
      }
    } else {
      nextIdx = (currentTrackIndex + 1) % tracks.length;
    }
    setCurrentTrackIndex(nextIdx);
    setCurrentTime(0);
    setExternalSeekTime(0);
    setIsPlaying(true);

    if (syncRef.current && !isSyncingFromRemote.current) {
      const nextTrk = tracks[nextIdx];
      syncRef.current.broadcast({
        type: 'AUDIO_PLAY',
        trackId: nextTrk?.id || '',
        currentTime: 0,
        sentAt: Date.now(),
        serverTimestamp: Date.now(),
      });
    }
  };

  const handlePrevTrack = () => {
    if (!canControlPlayback) return;
    if (tracks.length === 0) return;
    if (currentTime > 3) {
      if (audioRef.current && activeTrack?.sourceType !== 'youtube') {
        audioRef.current.currentTime = 0;
        audioRef.current.playbackRate = 1.0;
      }
      setExternalSeekTime(0);
      setCurrentTime(0);
      if (syncRef.current && !isSyncingFromRemote.current) {
        syncRef.current.broadcast({
          type: 'AUDIO_SEEK',
          currentTime: 0,
          isManual: true,
          sentAt: Date.now(),
        });
      }
      return;
    }
    const prevIdx = (currentTrackIndex - 1 + tracks.length) % tracks.length;
    setCurrentTrackIndex(prevIdx);
    setCurrentTime(0);
    setExternalSeekTime(0);
    setIsPlaying(true);

    if (syncRef.current && !isSyncingFromRemote.current) {
      const prevTrk = tracks[prevIdx];
      syncRef.current.broadcast({
        type: 'AUDIO_PLAY',
        trackId: prevTrk?.id || '',
        currentTime: 0,
        sentAt: Date.now(),
        serverTimestamp: Date.now(),
      });
    }
  };

  // Real scrub / seek on timeline (Works seamlessly with both native audio and YouTube)
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canControlPlayback) return;
    const totalDuration = duration || activeTrack?.durationSeconds || 180;
    if (totalDuration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percent * totalDuration;

    if (audioRef.current && activeTrack?.sourceType !== 'youtube') {
      audioRef.current.currentTime = newTime;
      audioRef.current.playbackRate = 1.0;
    }
    setExternalSeekTime(newTime);
    setCurrentTime(newTime);

    if (syncRef.current) {
      syncRef.current.broadcast({
        type: 'AUDIO_SEEK',
        currentTime: newTime,
        isManual: true,
        sentAt: Date.now(),
      });
    }
  };

  // Add newly uploaded device file or link to room queue
  const handleAddTrack = (data: AddedTrackData) => {
    if (!canAddMusic || (addMusicPermissionRef.current === 'admins' && !isUserAdminRef.current)) {
      alert('Adding music is currently restricted to room Admins.');
      return;
    }
    const ytId = data.url ? getYouTubeVideoId(data.url) : null;
    const sourceType = ytId ? 'youtube' : data.sourceType;

    const newTrk: RealTrack = {
      id: `trk-${Date.now()}`,
      title: data.title,
      artist: data.artist,
      duration: data.duration,
      durationSeconds: data.durationSeconds,
      addedBy: effectiveUserName,
      sourceType: sourceType,
      url: data.url,
      file: data.file,
      youtubeId: ytId,
    };

    const isFirstTrack = tracksRef.current.length === 0;

    setTracks((prev) => {
      const nextList = [...prev, newTrk];
      if (prev.length === 0) {
        setCurrentTrackIndex(0);
        setCurrentTime(0);
        setExternalSeekTime(0);
        setIsPlaying(true);
      }
      return nextList;
    });

    // Broadcast track addition to all connected peers
    if (syncRef.current) {
      syncRef.current.broadcast({
        type: 'QUEUE_ADD',
        track: {
          ...newTrk,
          file: undefined, // strip raw File object for JSON broadcast
        },
        isAdmin: isUserAdminRef.current,
        senderPeerId: syncRef.current.peerId,
      });

      if (isFirstTrack) {
        syncRef.current.broadcast({
          type: 'AUDIO_PLAY',
          trackId: newTrk.id,
          currentTime: 0,
          sentAt: Date.now(),
          serverTimestamp: Date.now(),
        });
      }

      // Broadcast raw audio file buffer over WebRTC DataChannel to all devices
      if (data.file) {
        data.file.arrayBuffer().then((buffer) => {
          if (syncRef.current) {
            syncRef.current.broadcastFile({
              trackId: newTrk.id,
              title: newTrk.title,
              artist: newTrk.artist,
              duration: newTrk.duration,
              durationSeconds: newTrk.durationSeconds,
              addedBy: effectiveUserName,
              buffer,
              type: data.file?.type || 'audio/mpeg',
            });
          }
        }).catch((err) => {
          console.warn('Error reading audio buffer for peer transfer:', err);
        });
      }
    }

    // Post real chat announcement
    const chatNotification: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: userName,
      text: `🎵 Added "${data.title}" (${data.sourceType.toUpperCase()}) to queue!`,
      time: 'Just now',
      isSelf: true,
    };
    setMessages((prev) => [...prev, chatNotification]);

    if (syncRef.current) {
      syncRef.current.broadcast({
        type: 'CHAT_MESSAGE',
        message: chatNotification,
      });
    }

    // If YouTube link had a placeholder/loading title, fetch real metadata in background
    if (ytId && (!data.title || data.title === 'YouTube Track' || data.title.startsWith('YouTube Track ('))) {
      fetchYouTubeVideoInfo(ytId)
        .then((info) => {
          if (info && info.title) {
            setTracks((prev) =>
              prev.map((t) =>
                t.id === newTrk.id ? { ...t, title: info.title, artist: info.author } : t
              )
            );
            if (syncRef.current) {
              syncRef.current.broadcast({
                type: 'TRACK_UPDATE',
                trackId: newTrk.id,
                title: info.title,
                artist: info.author,
              });
            }
          }
        })
        .catch(() => {});
    }
  };

  // Real-time Chat message send
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: effectiveUserName,
      text: chatInput.trim(),
      time: timeStr,
      isSelf: true,
    };

    setMessages((prev) => [...prev, newMsg]);
    setChatInput('');

    // Broadcast message to all connected peers
    if (syncRef.current) {
      syncRef.current.broadcast({
        type: 'CHAT_MESSAGE',
        message: newMsg,
      });
    }

    setTimeout(() => {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(hostel.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const formatSeconds = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const mins = Math.floor(secs / 60);
    const rem = Math.floor(secs % 60);
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  // Filtered tracks (if searchQuery is not a raw URL)
  const detectedSearchYtId = getYouTubeVideoId(searchQuery);

  const filteredTracks = tracks.filter(
    (t) =>
      !detectedSearchYtId &&
      (t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.artist.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Handle instant addition when pressing Enter on a YouTube or audio link (0ms delay)
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    if (!canAddMusic || (addMusicPermissionRef.current === 'admins' && !isUserAdminRef.current) || !searchQuery.trim()) return;

    const query = searchQuery.trim();
    const ytId = getYouTubeVideoId(query);

    // 1. YouTube link or ID
    if (ytId) {
      e.preventDefault();
      setSearchQuery('');

      const newTrk: RealTrack = {
        id: `trk-yt-${Date.now()}`,
        title: `YouTube Track (${ytId})`,
        artist: 'YouTube',
        duration: '03:45',
        durationSeconds: 225,
        addedBy: effectiveUserName,
        sourceType: 'youtube',
        url: query,
        youtubeId: ytId,
      };

      // Play instantly without waiting for any network round trips
      setTracks((prev) => {
        const nextList = [...prev, newTrk];
        if (prev.length === 0) {
          setCurrentTrackIndex(0);
          setCurrentTime(0);
          setExternalSeekTime(0);
          setIsPlaying(true);
        }
        return nextList;
      });

      if (syncRef.current) {
        syncRef.current.broadcast({
          type: 'QUEUE_ADD',
          track: newTrk,
          isAdmin: isUserAdminRef.current,
          senderPeerId: syncRef.current.peerId,
        });

        if (tracksRef.current.length === 0) {
          syncRef.current.broadcast({
            type: 'AUDIO_PLAY',
            trackId: newTrk.id,
            currentTime: 0,
            sentAt: Date.now(),
            serverTimestamp: Date.now(),
          });
        }

        const chatNotification: ChatMessage = {
          id: `msg-add-${Date.now()}`,
          sender: 'HostelSync',
          text: `${effectiveUserName} added a YouTube link to queue`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isSelf: false,
        };
        setMessages((prev) => [...prev, chatNotification]);
        syncRef.current.broadcast({
          type: 'CHAT_MESSAGE',
          message: chatNotification,
        });
      }

      // Asynchronously fetch video title & artist in the background and update seamlessly
      fetchYouTubeVideoInfo(ytId)
        .then((info) => {
          if (info && info.title) {
            setTracks((prev) =>
              prev.map((t) =>
                t.id === newTrk.id ? { ...t, title: info.title, artist: info.author } : t
              )
            );
            if (syncRef.current) {
              syncRef.current.broadcast({
                type: 'TRACK_UPDATE',
                trackId: newTrk.id,
                title: info.title,
                artist: info.author,
              });
            }
          }
        })
        .catch(() => {});
      return;
    }

    // 2. Direct Web Audio link (mp3, wav, stream, soundcloud)
    if (query.startsWith('http://') || query.startsWith('https://')) {
      e.preventDefault();
      setSearchQuery('');

      const isSc = query.toLowerCase().includes('soundcloud.com');
      const filename = query.split('/').pop()?.split('?')[0] || 'Shared Stream';
      const cleanTitle = filename.replace(/\.(mp3|wav|ogg|m4a|aac)$/i, '');

      const newTrk: RealTrack = {
        id: `trk-link-${Date.now()}`,
        title: cleanTitle || (isSc ? 'SoundCloud Track' : 'Web Audio Stream'),
        artist: isSc ? 'SoundCloud' : 'Web Stream',
        duration: '03:45',
        durationSeconds: 225,
        addedBy: effectiveUserName,
        sourceType: isSc ? 'soundcloud' : 'stream',
        url: query,
      };

      setTracks((prev) => {
        const nextList = [...prev, newTrk];
        if (prev.length === 0) {
          setCurrentTrackIndex(0);
          setCurrentTime(0);
          setExternalSeekTime(0);
          setIsPlaying(true);
        }
        return nextList;
      });

      if (syncRef.current) {
        syncRef.current.broadcast({
          type: 'QUEUE_ADD',
          track: newTrk,
          isAdmin: isUserAdminRef.current,
          senderPeerId: syncRef.current.peerId,
        });

        if (tracksRef.current.length === 0) {
          syncRef.current.broadcast({
            type: 'AUDIO_PLAY',
            trackId: newTrk.id,
            currentTime: 0,
            sentAt: Date.now(),
            serverTimestamp: Date.now(),
          });
        }
      }
      return;
    }
  };

  // Total count of real connected devices (You + other real connected tabs/peers)
  const totalConnectedCount = 1 + connectedPeers.length;

  return (
    <div className="flex flex-col h-[100dvh] w-screen overflow-hidden bg-[#0a0a0b] text-[#ededed] select-none font-sans">
      {/* Real HTML5 Audio Element for local and streaming audio */}
      {activeTrack?.url && activeTrack.sourceType !== 'youtube' && (
        <audio
          ref={audioRef}
          src={activeTrack.url}
          preload="auto"
          playsInline
          onCanPlay={() => {
            if (isPlayingRef.current && audioRef.current && audioRef.current.paused) {
              audioRef.current.play().then(() => {
                setHasAudioUnlocked(true);
              }).catch(() => {
                setHasAudioUnlocked(false);
              });
            }
          }}
        />
      )}

      {/* 1. TOP STATUS BAR (Clean, modern, and uncluttered on mobile) */}
      <header className="h-11 sm:h-10 px-3 sm:px-3.5 bg-[#0d0d0e] border-b border-neutral-800/80 flex items-center justify-between text-[11px] text-neutral-400 shrink-0">
        {/* Left: Brand + Room Name + Live Indicator */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-1.5 text-white font-medium shrink-0">
            <HostelSyncLogo size="sm" />
          </div>

          <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-[10px] shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="hidden xs:inline">LIVE SYNC</span>
          </div>

          <div className="flex items-center gap-1.5 font-medium text-white min-w-0">
            <span className="truncate max-w-[100px] xs:max-w-[140px] sm:max-w-xs">{currentRoomName}</span>
            <span className="font-mono text-neutral-400 text-[10px] shrink-0">
              #{hostel.code.replace('HS-', '')}
            </span>
            {isRoomLocked && (
              <span className="flex items-center gap-0.5 text-[9px] font-mono text-amber-400 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded-full shrink-0">
                <Lock className="w-2.5 h-2.5" /> Locked
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 text-neutral-400 shrink-0">
            <Users className="w-3 h-3" />
            <span className="hidden xs:inline">{totalConnectedCount} {totalConnectedCount === 1 ? 'device' : 'devices'}</span>
            <span className="xs:hidden">{totalConnectedCount}</span>
          </div>

          <span className="hidden md:inline text-neutral-700">|</span>

          {/* Real latency & offset measured from Web Performance clock */}
          <div className="hidden md:flex items-center gap-2 font-mono text-[10px] text-neutral-500">
            <span>Offset: {liveOffset >= 0 ? `+${liveOffset.toFixed(2)}ms` : `${liveOffset.toFixed(2)}ms`}</span>
            <span>RTT: {liveRtt.toFixed(2)}ms</span>
            <span>OL: 0ms</span>
          </div>
        </div>

        {/* Right: Social & Leave / Close Room */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <a
            href="https://discord.gg"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:block text-neutral-500 hover:text-white transition-colors"
            title="Community"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
          </a>

          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:block text-neutral-500 hover:text-white transition-colors"
            title="GitHub"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              />
            </svg>
          </a>

          {isRoomHost ? (
            <button
              type="button"
              onClick={handleCloseRoom}
              className="flex items-center gap-1.5 text-xs text-red-400 hover:text-white px-2.5 py-1 min-h-[34px] rounded-lg bg-red-500/10 hover:bg-red-600 border border-red-500/20 transition-colors cursor-pointer active:scale-95"
              title="Close Room for all members"
            >
              <Power className="w-3.5 h-3.5" />
              <span>Close room</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                handleLeaveOrRefresh();
                onLeave();
              }}
              className="flex items-center gap-1.5 text-xs text-neutral-300 hover:text-white px-2.5 py-1 min-h-[34px] rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer active:scale-95"
              title="Leave Room"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Leave</span>
            </button>
          )}
        </div>
      </header>

      {/* Autoplay Unlock Notice for Mobile Browsers */}
      {!hasAudioUnlocked && (
        <div
          onClick={() => {
            audioEngine.resume();
            setAudioUnlockVersion((v) => v + 1);
            if (audioRef.current && activeTrack?.url) {
              audioRef.current.play().catch(() => {});
            }
            if (remoteAudioRef.current && remoteAudioRef.current.srcObject) {
              remoteAudioRef.current.play().catch(() => {});
            }
            setHasAudioUnlocked(true);
          }}
          className="bg-emerald-500 text-black px-4 py-2 text-xs font-bold flex items-center justify-between cursor-pointer animate-pulse shrink-0 select-none z-30"
        >
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4" />
            <span>Audio paused by mobile browser. Tap here to listen live!</span>
          </div>
          <span className="bg-black text-white px-2.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold">
            Listen
          </span>
        </div>
      )}

      {/* Remote WebRTC Live Audio Stream Receiver */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        className="hidden"
      />

      {/* Mobile Navigation Tabs (visible only on mobile/tablet < lg) */}
      <div className="lg:hidden grid grid-cols-3 gap-1.5 bg-[#101012] border-b border-neutral-800/80 px-2.5 py-2 shrink-0 select-none">
        <button
          type="button"
          onClick={() => setMobileTab('music')}
          className={`min-h-[40px] py-2 px-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer active:scale-95 ${
            mobileTab === 'music'
              ? 'bg-white text-black font-semibold shadow-xs'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
          }`}
        >
          <Disc className="w-4 h-4 shrink-0" />
          <span className="truncate">Music</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('studio')}
          className={`min-h-[40px] py-2 px-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer active:scale-95 ${
            mobileTab === 'studio'
              ? 'bg-white text-black font-semibold shadow-xs'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4 shrink-0" />
          <span className="truncate">Studio</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('room')}
          className={`min-h-[40px] py-2 px-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer active:scale-95 ${
            mobileTab === 'room'
              ? 'bg-white text-black font-semibold shadow-xs'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
          }`}
        >
          <Users className="w-4 h-4 shrink-0" />
          <span className="truncate">Room ({totalConnectedCount})</span>
        </button>
      </div>

      {/* 2. THREE-COLUMN MAIN BODY */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT SIDEBAR (Room details, permissions, REAL connected users, upload audio button) */}
        <aside className={`w-full lg:w-72 bg-[#0c0c0d] lg:border-r border-neutral-800/80 flex-col justify-between p-3.5 pb-32 lg:pb-3.5 shrink-0 overflow-y-auto ${
          mobileTab === 'room' ? 'flex' : 'hidden lg:flex'
        }`}>
          <div>
            {/* Room Header with Editable Room Name */}
            <div className="flex items-center justify-between mb-4">
              <div className="truncate pr-2 flex-1">
                {isEditingRoomName && isRoomHost ? (
                  <form onSubmit={handleSaveRoomName} className="flex items-center gap-1.5 my-0.5">
                    <input
                      type="text"
                      value={editedRoomName}
                      onChange={(e) => setEditedRoomName(e.target.value)}
                      maxLength={30}
                      autoFocus
                      className="bg-neutral-900 border border-neutral-700 px-2 py-1 rounded text-xs text-white outline-none w-full font-medium focus:border-white"
                    />
                    <button
                      type="submit"
                      className="p-1 rounded text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 cursor-pointer shrink-0"
                      title="Save name"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditedRoomName(currentRoomName);
                        setIsEditingRoomName(false);
                      }}
                      className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer shrink-0"
                      title="Cancel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-white tracking-tight truncate">
                    <span className="text-neutral-500 font-mono">#</span>
                    <span className="truncate">{currentRoomName}</span>
                    {isRoomHost && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditedRoomName(currentRoomName);
                          setIsEditingRoomName(true);
                        }}
                        className="text-neutral-500 hover:text-white p-0.5 rounded transition-colors cursor-pointer shrink-0"
                        title="Change room name"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-neutral-400 mt-0.5">
                  <span>Room {hostel.code}</span>
                  {isRoomLocked && (
                    <span className="text-amber-400 font-semibold">• Locked</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowQrModal(true)}
                  className="text-neutral-400 hover:text-white p-1.5 rounded-lg hover:bg-neutral-800 transition-colors shrink-0 cursor-pointer"
                  title="Room QR & Code"
                >
                  <QrCode className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Room Access Lock (Creator Only) */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500 uppercase tracking-wider mb-2">
                <span className="flex items-center gap-1">
                  {isRoomLocked ? <Lock className="w-3 h-3 text-amber-400" /> : <Unlock className="w-3 h-3" />}
                  <span>ROOM ACCESS</span>
                </span>
                {isRoomHost ? (
                  <span className="text-[9px] text-amber-400/80 font-mono font-medium">Creator control</span>
                ) : (
                  <span className="text-[9px] text-neutral-500 font-mono">
                    {isRoomLocked ? 'Locked' : 'Open'}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between p-2.5 bg-neutral-900 border border-neutral-800 rounded-xl">
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      isRoomLocked ? 'bg-amber-500/20 text-amber-300' : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {isRoomLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-white flex items-center gap-1">
                      <span>{isRoomLocked ? 'Room is Locked' : 'Room is Unlocked'}</span>
                    </div>
                    <div className="text-[9px] text-neutral-400 truncate">
                      {isRoomLocked ? 'New participants cannot join' : 'Anyone with code can join'}
                    </div>
                  </div>
                </div>

                {isRoomHost ? (
                  <button
                    type="button"
                    onClick={handleToggleRoomLock}
                    className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer shrink-0 border ${
                      isRoomLocked
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                        : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:text-white hover:bg-neutral-700'
                    }`}
                  >
                    {isRoomLocked ? 'Unlock' : 'Lock Room'}
                  </button>
                ) : (
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0 ${
                      isRoomLocked ? 'bg-amber-500/10 text-amber-400' : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {isRoomLocked ? 'Locked' : 'Open'}
                  </span>
                )}
              </div>
            </div>

            {/* Playback Permissions section */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500 uppercase tracking-wider mb-2">
                <span className="flex items-center gap-1">
                  <Radio className="w-3 h-3" />
                  <span>PLAYBACK PERMISSIONS</span>
                </span>
                {!isUserAdmin && (
                  <span className="text-[9px] text-amber-500 flex items-center gap-0.5">
                    <Lock className="w-2.5 h-2.5" /> Admin Only
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 p-0.5 bg-neutral-900 border border-neutral-800 rounded-full text-xs">
                <button
                  type="button"
                  onClick={() => handleTogglePlaybackPermission('everyone')}
                  disabled={!isUserAdmin}
                  className={`py-1 rounded-full text-[11px] font-medium transition-colors flex items-center justify-center gap-1 ${
                    playbackPermission === 'everyone'
                      ? 'bg-neutral-800 text-white shadow-xs'
                      : 'text-neutral-400 hover:text-white'
                  } ${!isUserAdmin ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <Users className="w-3 h-3" />
                  <span>Everyone</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTogglePlaybackPermission('admins')}
                  disabled={!isUserAdmin}
                  className={`py-1 rounded-full text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 ${
                    playbackPermission === 'admins'
                      ? 'bg-[#eab308] text-black shadow-xs'
                      : 'text-neutral-400 hover:text-white'
                  } ${!isUserAdmin ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <Crown className="w-3 h-3" />
                  <span>Admins</span>
                </button>
              </div>
            </div>

            {/* Add Music Permissions section */}
            <div className="mb-6">
              <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500 uppercase tracking-wider mb-2">
                <span className="flex items-center gap-1">
                  <Music className="w-3 h-3" />
                  <span>ADD MUSIC PERMISSIONS</span>
                </span>
              </div>
              <div className="grid grid-cols-2 p-0.5 bg-neutral-900 border border-neutral-800 rounded-full text-xs">
                <button
                  type="button"
                  onClick={() => handleToggleAddMusicPermission('everyone')}
                  disabled={!isUserAdmin}
                  className={`py-1 rounded-full text-[11px] font-medium transition-colors flex items-center justify-center gap-1 ${
                    addMusicPermission === 'everyone'
                      ? 'bg-neutral-800 text-white shadow-xs'
                      : 'text-neutral-400 hover:text-white'
                  } ${!isUserAdmin ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <Users className="w-3 h-3" />
                  <span>Everyone</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleAddMusicPermission('admins')}
                  disabled={!isUserAdmin}
                  className={`py-1 rounded-full text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 ${
                    addMusicPermission === 'admins'
                      ? 'bg-emerald-500 text-black shadow-xs'
                      : 'text-neutral-400 hover:text-white'
                  } ${!isUserAdmin ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <Crown className="w-3 h-3" />
                  <span>Admins</span>
                </button>
              </div>
            </div>

            {/* REAL Connected Users (Only actual users in this room) */}
            <div>
              <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500 uppercase tracking-wider mb-2.5">
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  <span>CONNECTED DEVICES</span>
                </span>
                <span className="px-1.5 py-0.2 bg-neutral-800 text-neutral-300 rounded-full text-[10px] font-mono">
                  {totalConnectedCount}
                </span>
              </div>

              {/* User row: You */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-2.5 py-1.5 bg-neutral-900/90 border border-neutral-800 rounded-lg">
                  <div className="flex items-center gap-2 min-w-0">
                    <Headphones className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                    {isRoomHost ? (
                      <span className="text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold px-1.5 py-0.2 rounded shrink-0">
                        Creator
                      </span>
                    ) : isUserAdmin ? (
                      <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                    ) : null}
                    <span className="text-xs font-medium text-white truncate max-w-[120px]">
                      {effectiveUserName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      You
                    </span>
                  </div>
                </div>

                {/* Other Real Connected Peers from other tabs/devices */}
                {connectedPeers.map((peer) => {
                  const peerIsAdmin = adminPeerIds.includes(peer.id) || Boolean(peer.isHost);
                  return (
                    <div
                      key={peer.id}
                      className="flex items-center justify-between px-2.5 py-1.5 text-xs text-neutral-300 bg-neutral-950/60 border border-neutral-850 rounded-lg group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Laptop className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        {peer.isHost ? (
                          <span className="text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold px-1.5 py-0.2 rounded shrink-0">
                            Creator
                          </span>
                        ) : peerIsAdmin ? (
                          <Crown className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
                        ) : null}
                        <span className="truncate max-w-[120px] text-white font-medium">
                          {peer.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* ONLY the person who creates the room has perms to create / toggle other admins */}
                        {isRoomHost && !peer.isHost ? (
                          <button
                            type="button"
                            onClick={() => handleTogglePeerAdmin(peer.id)}
                            className={`px-1.5 py-0.5 rounded transition-colors text-[10px] font-medium flex items-center gap-1 cursor-pointer ${
                              peerIsAdmin
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30'
                                : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-white hover:bg-neutral-700'
                            }`}
                            title={peerIsAdmin ? 'Revoke Admin' : 'Make Admin'}
                          >
                            <Crown className={`w-3 h-3 ${peerIsAdmin ? 'fill-amber-400 text-amber-400' : 'text-neutral-400'}`} />
                            <span>{peerIsAdmin ? 'Admin' : '+ Admin'}</span>
                          </button>
                        ) : peerIsAdmin && !peer.isHost ? (
                          <span className="text-[9px] text-amber-400/90 font-medium px-1">Admin</span>
                        ) : null}
                        {/* Creator can remove / kick participant */}
                        {isRoomHost && !peer.isHost && (
                          <button
                            type="button"
                            onClick={() => handleKickParticipant(peer.id, peer.name)}
                            className="p-1 rounded text-neutral-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-colors cursor-pointer"
                            title={`Remove ${peer.name} from room`}
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom Sidebar: Tips and Upload Audio Button */}
          <div className="pt-4 border-t border-neutral-800/80 mt-4">
            <div className="mb-3 text-[11px] text-neutral-500">
              <span className="font-semibold text-neutral-400 block mb-1">Tips</span>
              <ul className="space-y-1">
                <li>• Play on speaker directly. Don&#39;t use Bluetooth.</li>
                <li>• Open this room code in another tab to hear live sync!</li>
              </ul>
            </div>

            {/* REAL UPLOAD AUDIO BUTTON */}
            <button
              type="button"
              onClick={() => {
                if (canAddMusic) setShowAddTrackModal(true);
              }}
              disabled={!canAddMusic}
              className={`w-full py-2.5 px-3 bg-neutral-900 border border-neutral-800 rounded-xl flex items-center gap-2.5 text-left transition-colors group shadow-sm ${
                canAddMusic
                  ? 'hover:bg-neutral-850 cursor-pointer active:scale-[0.99]'
                  : 'opacity-50 cursor-not-allowed'
              }`}
              title={canAddMusic ? 'Upload music' : 'Only Admins can add music'}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                canAddMusic
                  ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-black'
                  : 'bg-neutral-800 text-neutral-500 border border-neutral-700'
              }`}>
                {canAddMusic ? <Plus className="w-4 h-4" /> : <Lock className="w-3.5 h-3.5" />}
              </div>
              <div className="truncate">
                <div className="text-xs font-medium text-white truncate">
                  {canAddMusic ? 'Upload music' : 'Upload locked'}
                </div>
                <div className="text-[10px] text-neutral-400 truncate">
                  {canAddMusic ? 'Device or YouTube link' : 'Admin only'}
                </div>
              </div>
            </button>
          </div>
        </aside>

        {/* CENTER COLUMN (Search prompt, Real track queue, real player) */}
        <main className={`flex-1 bg-[#09090a] flex-col overflow-y-auto ${
          mobileTab === 'music'
            ? 'flex'
            : 'max-lg:fixed max-lg:-top-[9999px] max-lg:-left-[9999px] max-lg:opacity-0 max-lg:pointer-events-none max-lg:w-0 max-lg:h-0 max-lg:overflow-hidden lg:flex'
        }`}>
          {/* Top Search / Command Bar */}
          <div className="p-3 sm:p-6 pb-2">
            <div className="relative max-w-xl mx-auto">
              <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                disabled={!canAddMusic}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={
                  canAddMusic
                    ? "Search or paste YouTube / MP3 link..."
                    : "Adding music is restricted to Admins"
                }
                className={`w-full bg-neutral-900/90 border border-neutral-800 rounded-lg pl-9 sm:pl-10 pr-4 sm:pr-10 py-2 text-xs text-white placeholder:text-neutral-500 outline-none transition-colors ${
                  canAddMusic ? 'focus:border-neutral-700' : 'opacity-60 cursor-not-allowed'
                }`}
              />
              <span className="hidden sm:inline-block absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-700">
                ⌘K
              </span>
            </div>

            {/* Quick detected YouTube pill if link entered */}
            {detectedSearchYtId && (
              <div className="max-w-xl mx-auto mt-2 flex items-center justify-between px-3 py-1.5 bg-red-950/40 border border-red-800/50 rounded-lg text-xs animate-in fade-in">
                <span className="flex items-center gap-1.5 text-red-300 font-mono text-[11px]">
                  <Film className="w-3.5 h-3.5 text-red-400" />
                  YouTube Link Detected!
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const fakeEvent = {
                      key: 'Enter',
                      preventDefault: () => {},
                    } as any;
                    handleSearchKeyDown(fakeEvent);
                  }}
                  className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white font-medium text-[11px] rounded-md transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span>Press Enter to Add Track</span>
                  <span className="font-mono text-[9px] bg-red-800/80 px-1 py-0.5 rounded">↵</span>
                </button>
              </div>
            )}

            <div className="text-center mt-2 text-[10px] font-mono text-neutral-600 tracking-wider">
              ✦ [REALTIME AUDIO SYNC ACTIVE]
            </div>
          </div>

          {/* YouTube Player with Real Bidirectional Sync */}
          {activeTrack?.sourceType === 'youtube' && activeTrack.youtubeId && (
            <div className="px-6 py-3 flex flex-col items-center justify-center">
              <YouTubePlayer
                key="main-room-yt-player"
                videoId={activeTrack.youtubeId}
                isPlaying={isPlaying}
                volume={effectiveVolume}
                isMuted={isMuted}
                seekTime={externalSeekTime}
                unlockedTrigger={audioUnlockVersion}
                onAutoplayBlocked={() => setHasAudioUnlocked(false)}
                onTimeUpdate={(curr, dur) => {
                  if (Math.abs(curr - lastAudioTimeRef.current) >= 0.25) {
                    lastAudioTimeRef.current = curr;
                    setCurrentTime(curr);
                  }
                  if (dur > 0 && Math.abs(duration - dur) > 1.0) {
                    setDuration(dur);
                  }
                }}
                onStateChange={(state) => {
                  if (state === 'playing') {
                    setIsPlaying(true);
                    setHasAudioUnlocked(true);
                    if (isUserAdminRef.current && syncRef.current && !isSyncingFromRemote.current) {
                      syncRef.current.broadcast({
                        type: 'AUDIO_PLAY',
                        trackId: activeTrack.id,
                        currentTime: lastAudioTimeRef.current > 0 ? lastAudioTimeRef.current : 0,
                        sentAt: Date.now(),
                        serverTimestamp: Date.now(),
                      });
                    }
                  } else if (state === 'paused') {
                    if (!isSyncingFromRemote.current) {
                      setIsPlaying(false);
                      if (isUserAdminRef.current && syncRef.current) {
                        syncRef.current.broadcast({
                          type: 'AUDIO_PAUSE',
                          trackId: activeTrack.id,
                          currentTime: lastAudioTimeRef.current > 0 ? lastAudioTimeRef.current : 0,
                          sentAt: Date.now(),
                        });
                      }
                    }
                  } else if (state === 'ended') {
                    if (isUserAdminRef.current) {
                      handleNextTrack();
                    }
                  }
                }}
              />
              <div className="mt-2.5 flex items-center gap-2 text-[11px] text-neutral-400">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="font-medium text-white truncate max-w-sm">{activeTrack.title}</span>
                <span className="text-neutral-600">·</span>
                <span className="text-neutral-400">{activeTrack.artist}</span>
              </div>
            </div>
          )}

          {/* Main Queue / Empty State */}
          <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 pb-28 lg:pb-8 text-center">
            {tracks.length === 0 ? (
              <div className="flex flex-col items-center animate-in fade-in duration-200">
                <p className="text-xs text-neutral-400 mb-4 font-medium">
                  {canAddMusic ? 'No tracks yet' : 'No tracks yet · Music addition locked by Admin'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (canAddMusic) setShowAddTrackModal(true);
                  }}
                  disabled={!canAddMusic}
                  className={`px-5 py-2 font-medium text-xs rounded-full shadow-sm transition-colors flex items-center gap-1.5 ${
                    canAddMusic
                      ? 'bg-white text-black hover:bg-neutral-200 cursor-pointer'
                      : 'bg-neutral-800 text-neutral-500 opacity-60 cursor-not-allowed'
                  }`}
                  title={canAddMusic ? 'Upload music' : 'Only Admins can add music'}
                >
                  {canAddMusic ? <Upload className="w-3.5 h-3.5 text-black" /> : <Lock className="w-3.5 h-3.5 text-neutral-500" />}
                  <span>{canAddMusic ? 'Upload music' : 'Upload locked'}</span>
                </button>
              </div>
            ) : (
              <div className="w-full max-w-2xl text-left space-y-2">
                <div className="flex items-center justify-between mb-3 text-xs text-neutral-400">
                  <span className="font-mono text-[11px] uppercase tracking-wider">
                    Room Queue ({filteredTracks.length})
                  </span>
                  <div className="flex items-center gap-2">
                    {canAddMusic ? (
                      <button
                        type="button"
                        onClick={() => setShowAddTrackModal(true)}
                        className="text-[11px] text-neutral-300 hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Add Track
                      </button>
                    ) : (
                      <span className="text-[11px] text-neutral-500 flex items-center gap-1 cursor-not-allowed">
                        <Lock className="w-3 h-3 text-neutral-600" /> Upload locked
                      </span>
                    )}
                    {isUserAdmin && (
                      <>
                        <span>·</span>
                        <button
                          type="button"
                          onClick={() => {
                            setTracks([]);
                            setIsPlaying(false);
                            if (syncRef.current) {
                              syncRef.current.broadcast({ type: 'QUEUE_CLEAR', isAdmin: true });
                            }
                          }}
                          className="text-[11px] text-neutral-500 hover:text-neutral-300 cursor-pointer"
                        >
                          Clear queue
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {filteredTracks.map((tr, index) => {
                  const isCurrent = currentTrackIndex === index;
                  return (
                    <div
                      key={tr.id}
                      onClick={() => {
                        setCurrentTrackIndex(index);
                        setCurrentTime(0);
                        setIsPlaying(true);
                        if (syncRef.current) {
                          syncRef.current.broadcast({
                            type: 'AUDIO_PLAY',
                            trackId: tr.id,
                            currentTime: 0,
                            sentAt: Date.now(),
                            serverTimestamp: Date.now(),
                          });
                        }
                      }}
                      className={`p-3 rounded-lg border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                        isCurrent
                          ? 'bg-neutral-900 border-neutral-700 shadow-xs'
                          : 'bg-neutral-950/50 border-neutral-850 hover:bg-neutral-900/60'
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate">
                        <div
                          className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${
                            isCurrent
                              ? 'bg-emerald-500 text-black'
                              : 'bg-neutral-800 text-neutral-400'
                          }`}
                        >
                          {isCurrent && isPlaying ? (
                            <Radio className="w-4 h-4 animate-spin" />
                          ) : (
                            <Music className="w-4 h-4" />
                          )}
                        </div>
                        <div className="truncate">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs font-medium truncate ${
                                isCurrent ? 'text-white' : 'text-neutral-300'
                              }`}
                            >
                              {tr.title}
                            </span>

                            {/* Source Platform Badge */}
                            {tr.sourceType === 'device' && (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-mono shrink-0">
                                DEVICE
                              </span>
                            )}
                            {tr.sourceType === 'youtube' && (
                              <span className="px-1.5 py-0.2 rounded bg-red-500/10 text-red-400 border border-red-500/20 text-[9px] font-mono shrink-0 flex items-center gap-0.5">
                                <Film className="w-2.5 h-2.5" /> YOUTUBE
                              </span>
                            )}
                            {tr.sourceType === 'soundcloud' && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] font-mono shrink-0">
                                SOUNDCLOUD
                              </span>
                            )}
                            {tr.sourceType === 'stream' && (
                              <span className="px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[9px] font-mono shrink-0">
                                STREAM
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-neutral-500 truncate">
                            {tr.artist} · Added by {tr.addedBy}
                          </div>
                        </div>
                      </div>

                      <div className="font-mono text-xs text-neutral-400 shrink-0">
                        {isCurrent && duration > 0
                          ? `${formatSeconds(currentTime)} / ${formatSeconds(duration)}`
                          : tr.duration}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>

        {/* RIGHT SIDEBAR (Real Live Chat & Spatial Audio) */}
        <aside className={`w-full lg:w-80 bg-[#0c0c0d] lg:border-l border-neutral-800/80 flex-col h-full min-h-0 shrink-0 ${
          mobileTab === 'studio' ? 'flex' : 'hidden lg:flex'
        }`}>
          {/* Top Tabs */}
          <div className="flex items-center p-2 border-b border-neutral-800/80 gap-1.5 text-xs shrink-0">
            <button
              type="button"
              onClick={() => setRightTab('chat')}
              className={`flex-1 py-2 min-h-[38px] rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                rightTab === 'chat'
                  ? 'bg-neutral-800 text-white font-semibold shadow-xs'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Chat</span>
            </button>
            <button
              type="button"
              onClick={() => setRightTab('spatial')}
              className={`flex-1 py-2 min-h-[38px] rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                rightTab === 'spatial'
                  ? 'bg-neutral-800 text-white font-semibold shadow-xs'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Spatial Audio</span>
            </button>
          </div>

          {/* Right Sidebar Body */}
          {rightTab === 'chat' ? (
            <div className="p-3 overflow-y-auto flex-1 min-h-0 space-y-3">
              {messages.length === 0 ? (
                <div className="py-24 flex flex-col items-center justify-center text-center">
                  <MessageSquare className="w-8 h-8 text-neutral-600 mb-2 stroke-[1.5]" />
                  <p className="text-xs text-neutral-400 font-medium">No messages yet</p>
                  <p className="text-[11px] text-neutral-600">Start the conversation</p>
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`text-xs rounded-xl p-3 ${
                      m.isSelf
                        ? 'bg-neutral-800 text-white ml-4'
                        : 'bg-neutral-900 border border-neutral-800 text-neutral-200 mr-4'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-1">
                      <span className="font-semibold">{m.isSelf ? 'You' : m.sender}</span>
                      <span>{m.time}</span>
                    </div>
                    <p className="leading-relaxed">{m.text}</p>
                  </div>
                ))
              )}
              <div ref={chatBottomRef} />
            </div>
          ) : (
            /* BeatSync Spatial Audio Studio Tab */
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <SpatialAudioTab
                userName={effectiveUserName}
                isHost={isRoomHost}
                connectedPeers={connectedPeers}
                adminPeerIds={adminPeerIds}
                onSpatialChange={handleSpatialChange}
              />
            </div>
          )}

          {/* Bottom Chat Input Form */}
          {rightTab === 'chat' && (
            <form onSubmit={handleSendMessage} className="p-2.5 sm:p-3 border-t border-neutral-800/80 bg-[#0d0d0e] shrink-0">
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type a message..."
                  className="w-full bg-neutral-900 border border-neutral-750 focus:border-neutral-500 rounded-xl px-3.5 py-2.5 min-h-[42px] text-xs text-white placeholder:text-neutral-500 outline-none pr-10"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white disabled:opacity-30 p-1.5 cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}
        </aside>
      </div>

      {/* 3. BOTTOM AUDIO PLAYER BAR (Real seekable audio timeline, real playback) */}
      <footer className="h-16 px-3 sm:px-4 bg-[#0a0a0b] border-t border-neutral-800/80 flex flex-col justify-center shrink-0 text-xs select-none relative z-30">
        {/* Seekable Progress Bar across top of player */}
        <div
          onClick={canControlPlayback ? handleSeek : undefined}
          className={`absolute top-0 left-0 w-full h-2 -translate-y-1 transition-all group cursor-pointer ${
            canControlPlayback
              ? 'hover:h-3'
              : 'cursor-default'
          }`}
          title={canControlPlayback ? 'Click to seek' : 'Seeking locked (Admin only)'}
        >
          <div className="w-full h-1 bg-neutral-800 relative">
            <div
              className="h-full bg-white group-hover:bg-emerald-400 transition-all relative"
              style={{
                width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%',
              }}
            >
              {canControlPlayback && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white opacity-0 group-hover:opacity-100 shadow" />
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-1 gap-2">
          {/* Left section:
              - On Desktop: Metronome + Offset Latency + RTT
              - On Mobile: Current playing track info */}
          <div className="flex items-center min-w-0 sm:w-72 shrink-0">
            {/* Desktop metronome & telemetry */}
            <div className="hidden sm:flex items-center gap-2.5 text-neutral-400 font-mono text-xs">
              <button
                type="button"
                onClick={toggleMetronome}
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-all cursor-pointer border shrink-0 ${
                  isMetronomeActive
                    ? 'bg-emerald-500 text-black border-emerald-400 shadow-sm shadow-emerald-500/30'
                    : 'bg-neutral-900 text-neutral-300 border-neutral-800 hover:text-white hover:bg-neutral-800'
                }`}
                title={isMetronomeActive ? 'Stop Metronome Sync' : 'Start Metronome Sync'}
              >
                <span className={`text-[10px] font-bold ${isMetronomeActive ? 'animate-pulse' : ''}`}>
                  M
                </span>
              </button>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setLiveOffset((o) => o - 5)}
                  className="hover:text-white px-1 py-0.5 text-neutral-500 hover:bg-neutral-800 rounded transition-colors cursor-pointer text-xs font-bold leading-none"
                  title="-5ms delay"
                >
                  «
                </button>
                <span className="text-[11px] text-neutral-300 w-11 text-center font-mono">
                  {liveOffset >= 0 ? `+${liveOffset.toFixed(0)}ms` : `${liveOffset.toFixed(0)}ms`}
                </span>
                <button
                  type="button"
                  onClick={() => setLiveOffset((o) => o + 5)}
                  className="hover:text-white px-1 py-0.5 text-neutral-500 hover:bg-neutral-800 rounded transition-colors cursor-pointer text-xs font-bold leading-none"
                  title="+5ms delay"
                >
                  »
                </button>
              </div>

              <span className="px-1.5 py-0.5 bg-neutral-900 border border-neutral-800 rounded text-[10px] text-neutral-400 font-mono shrink-0">
                {liveRtt.toFixed(1)}ms
              </span>

              <span
                onClick={toggleMetronome}
                className={`text-[10px] cursor-pointer transition-colors select-none shrink-0 ${
                  isMetronomeActive ? 'text-emerald-400 font-semibold' : 'text-neutral-500 hover:text-neutral-400'
                }`}
              >
                metronome
              </span>
            </div>

            {/* Mobile now playing info */}
            <div className="flex sm:hidden items-center gap-2 min-w-0 max-w-[120px] xs:max-w-[150px]">
              <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center shrink-0">
                {isPlaying ? (
                  <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                ) : (
                  <Music className="w-4 h-4 text-neutral-500" />
                )}
              </div>
              <div className="min-w-0 truncate">
                <div className="text-[11px] font-semibold text-white truncate leading-tight">
                  {activeTrack?.title || 'No track'}
                </div>
                <div className="text-[9px] text-neutral-400 truncate leading-tight mt-0.5">
                  {activeTrack?.artist || 'HostelSync'}
                </div>
              </div>
            </div>
          </div>

          {/* Center: Playback Controls */}
          <div className="flex flex-col items-center gap-0.5 shrink-0">
            <div className="flex items-center gap-2.5 sm:gap-4">
              <button
                type="button"
                onClick={() => setIsShuffle(!isShuffle)}
                className={`hidden xs:block transition-colors cursor-pointer ${
                  isShuffle ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'
                }`}
                title="Shuffle"
              >
                <Shuffle className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={handlePrevTrack}
                disabled={!canControlPlayback}
                className={`transition-colors p-2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg ${
                  canControlPlayback
                    ? 'text-neutral-400 hover:text-white hover:bg-neutral-800/60 cursor-pointer active:scale-95'
                    : 'text-neutral-600 cursor-not-allowed opacity-50'
                }`}
                title={canControlPlayback ? 'Previous' : 'Only Admins can control playback'}
              >
                <SkipBack className="w-4 h-4" />
              </button>

              {/* Main Circular Play/Pause (Real audio trigger with accessible touch target) */}
              <button
                type="button"
                onClick={togglePlay}
                disabled={!canControlPlayback}
                className={`w-10 h-10 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all shadow-md active:scale-95 ${
                  canControlPlayback
                    ? 'bg-white text-black hover:bg-neutral-200 cursor-pointer'
                    : 'bg-neutral-800 text-neutral-500 cursor-not-allowed opacity-50'
                }`}
                title={canControlPlayback ? (isPlaying ? 'Pause' : 'Play') : 'Only Admins can control playback'}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={handleNextTrack}
                disabled={!canControlPlayback}
                className={`transition-colors p-2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg ${
                  canControlPlayback
                    ? 'text-neutral-400 hover:text-white hover:bg-neutral-800/60 cursor-pointer active:scale-95'
                    : 'text-neutral-600 cursor-not-allowed opacity-50'
                }`}
                title={canControlPlayback ? 'Next' : 'Only Admins can control playback'}
              >
                <SkipForward className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setIsRepeat(!isRepeat)}
                className={`hidden xs:block relative transition-colors cursor-pointer ${
                  isRepeat ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'
                }`}
                title="Repeat"
              >
                <Repeat className="w-3.5 h-3.5" />
                {isRepeat && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-400" />
                )}
              </button>
            </div>

            {/* Real Time Counter */}
            <div className="text-[10px] font-mono text-neutral-500">
              {formatSeconds(currentTime)} / {formatSeconds(duration || (activeTrack?.durationSeconds || 0))}
            </div>
          </div>

          {/* Right: Volume Slider & Mute Toggle with accessible mobile tap area */}
          <div className="flex items-center justify-end gap-2 sm:w-48 shrink-0">
            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              className="text-neutral-400 hover:text-white p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer active:scale-95"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-red-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-neutral-300" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                setVolume(parseInt(e.target.value, 10));
                if (isMuted) setIsMuted(false);
              }}
              className="hidden sm:block w-24 h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-white"
            />
          </div>
        </div>
      </footer>

      {/* Real Scannable Room QR Code Modal */}
      <RoomQrModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        roomCode={hostel.code}
        hostelName={hostel.name}
      />

      {/* Real Upload Audio Modal (Direct Device + YouTube/Web Link) */}
      <UploadAudioModal
        isOpen={showAddTrackModal && canAddMusic}
        onClose={() => setShowAddTrackModal(false)}
        onAddTrack={handleAddTrack}
        userName={effectiveUserName}
        canAddMusic={canAddMusic}
      />
      {/* Kicked Notice Modal */}
      {kickedNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-xs w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-5 text-center shadow-2xl">
            <div className="w-10 h-10 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-3">
              <UserMinus className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">Removed from Room</h3>
            <p className="text-xs text-neutral-400 mb-4">{kickedNotice}</p>
            <button
              type="button"
              onClick={onLeave}
              className="w-full py-2 bg-white text-black font-medium text-xs rounded-full hover:bg-neutral-200 cursor-pointer transition-colors shadow-sm"
            >
              Back to Home
            </button>
          </div>
        </div>
      )}

      {/* Room Closed Notice Modal */}
      {closedNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-xs w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-5 text-center shadow-2xl">
            <div className="w-10 h-10 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-3">
              <Power className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">Room Closed</h3>
            <p className="text-xs text-neutral-400 mb-4">{closedNotice}</p>
            <button
              type="button"
              onClick={onLeave}
              className="w-full py-2 bg-white text-black font-medium text-xs rounded-full hover:bg-neutral-200 cursor-pointer transition-colors shadow-sm"
            >
              Back to Home
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
