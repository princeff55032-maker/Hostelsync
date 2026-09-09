'use client';

import { joinRoom } from 'trystero/nostr';

// Real-time cross-device synchronization layer using WebRTC (Trystero Nostr) + local BroadcastChannel
export interface Peer {
  id: string;
  name: string;
  isHost: boolean;
  isAdmin?: boolean;
  lastSeen: number;
  deviceType: string;
}

export interface TrackFileData {
  trackId: string;
  title: string;
  artist: string;
  duration: string;
  durationSeconds: number;
  addedBy: string;
  buffer: ArrayBuffer;
  type: string;
}

export type SyncEvent =
  | { type: 'PEER_PING'; peerId: string; name: string; isHost: boolean; timestamp: number }
  | { type: 'PEER_PONG'; peerId: string; name: string; isHost?: boolean; origTimestamp: number }
  | { type: 'PEER_LEAVE'; peerId: string }
  | { type: 'AUDIO_PLAY'; trackId: string; currentTime: number; serverTimestamp?: number; sentAt?: number }
  | { type: 'AUDIO_PAUSE'; trackId: string; currentTime: number; sentAt?: number }
  | { type: 'AUDIO_SEEK'; currentTime: number; isManual?: boolean; sentAt?: number }
  | { type: 'QUEUE_ADD'; track: any; isAdmin?: boolean; senderPeerId?: string }
  | { type: 'QUEUE_CLEAR'; isAdmin?: boolean }
  | { type: 'CHAT_MESSAGE'; message: any }
  | {
      type: 'PERMISSIONS_UPDATE';
      playbackPermission: 'everyone' | 'admins';
      addMusicPermission: 'everyone' | 'admins';
      adminPeerIds: string[];
    }
  | {
      type: 'ADMIN_TRANSFER';
      newAdminPeerId: string;
      newAdminName: string;
    }
  | {
      type: 'ROOM_DELETED';
      roomCode: string;
      reason?: string;
    }
  | {
      type: 'PEER_KICKED';
      targetPeerId: string;
      memberName?: string;
    }
  | {
      type: 'ROOM_NAME_UPDATED';
      newName: string;
    }
  | {
      type: 'ROOM_LOCK_UPDATED';
      isLocked: boolean;
    }
  | {
      type: 'REQUEST_ROOM_STATE';
      peerId: string;
    }
  | {
      type: 'ROOM_STATE_SYNC';
      tracks: any[];
      currentTrackIndex: number;
      isPlaying: boolean;
      currentTime: number;
      serverTimestamp?: number;
      sentAt?: number;
      playbackPermission: 'everyone' | 'admins';
      addMusicPermission: 'everyone' | 'admins';
      adminPeerIds: string[];
      roomName?: string;
      isLocked?: boolean;
    };

export class RoomSync {
  private channel: BroadcastChannel | null = null;
  private trysteroRoom: any = null;
  private sendWebRtcAction: ((data: any) => Promise<any>) | null = null;
  private sendFileAction: ((data: any, options?: any) => Promise<any>) | null = null;
  private activeStream: MediaStream | null = null;
  private roomCode: string;
  public peerId: string;
  public peerName: string;
  public isHost: boolean;
  private onEventCallback: ((event: SyncEvent) => void) | null = null;
  private onStreamCallback: ((stream: MediaStream, peerId: string) => void) | null = null;
  private onFileCallback: ((fileData: TrackFileData) => void) | null = null;
  private heartbeatInterval: any = null;
  private serverPollInterval: any = null;
  private lastServerEventTime: number = 0;
  private processedEventIds = new Set<string>();
  private isClosed: boolean = false;
  public measuredRtt: number = 2.4;
  public measuredOffset: number = 0;

  constructor(roomCode: string, peerName: string, isHost: boolean = false) {
    this.roomCode = roomCode;
    this.peerName = peerName || 'Resident';
    this.isHost = isHost;
    this.peerId = `peer_${Math.random().toString(36).substring(2, 9)}`;

    if (typeof window !== 'undefined') {
      // 1. Same-device local BroadcastChannel
      if ('BroadcastChannel' in window) {
        try {
          this.channel = new BroadcastChannel(`hostelsync_room_${roomCode}`);
          this.channel.onmessage = (e) => this.handleIncomingMessage(e.data, 'local');
        } catch {}
      }

      // 2. Cross-device WebRTC mesh (Nostr signaling)
      try {
        const cleanRoom = roomCode.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const room = joinRoom({ appId: 'hostelsync_sync_v2' }, cleanRoom);
        this.trysteroRoom = room;

        const action = room.makeAction<any>('sync_action');
        this.sendWebRtcAction = (data: any) => action.send(data);

        action.onMessage = (data: any) => {
          if (data) {
            this.handleIncomingMessage(data as SyncEvent, 'webrtc');
          }
        };

        // Binary audio file transfer action across devices
        const fileAction = room.makeAction<any>('file_sync');
        this.sendFileAction = (data: any, options?: any) => fileAction.send(data, options);

        fileAction.onMessage = (data: any, metaObj: any) => {
          if (data && this.onFileCallback) {
            const meta = metaObj?.metadata || {};
            this.onFileCallback({
              buffer: data,
              trackId: meta.trackId,
              title: meta.title,
              artist: meta.artist,
              duration: meta.duration,
              durationSeconds: meta.durationSeconds,
              addedBy: meta.addedBy,
              type: meta.type || 'audio/mpeg',
            });
          }
        };

        // Live real-time audio MediaStream receiver
        room.onPeerStream = (stream: MediaStream, fromPeerId: string) => {
          if (stream && this.onStreamCallback) {
            this.onStreamCallback(stream, fromPeerId);
          }
        };

        room.onPeerJoin = (newPeerId: string) => {
          // Immediately announce ourselves to the newly connected device
          this.broadcast({
            type: 'PEER_PING',
            peerId: this.peerId,
            name: this.peerName,
            isHost: this.isHost,
            timestamp: performance.now(),
          });

          // If we have an active audio stream, send it directly to the joining peer
          if (this.activeStream && typeof room.addStream === 'function') {
            try {
              room.addStream(this.activeStream, { target: newPeerId });
            } catch (e) {
              console.warn('Error streaming audio to joining peer:', e);
            }
          }
        };

        room.onPeerLeave = (leftPeerId: string) => {
          if (this.onEventCallback) {
            this.onEventCallback({
              type: 'PEER_LEAVE',
              peerId: leftPeerId,
            });
          }
        };
      } catch (err) {
        console.warn('Cross-device WebRTC init notice:', err);
      }

      this.startHeartbeat();
      this.startServerSync();
    }
  }

  public setEventHandler(callback: (event: SyncEvent) => void) {
    this.onEventCallback = callback;
  }

  public onStream(callback: (stream: MediaStream, peerId: string) => void) {
    this.onStreamCallback = callback;
  }

  public onFile(callback: (fileData: TrackFileData) => void) {
    this.onFileCallback = callback;
  }

  public streamAudio(stream: MediaStream) {
    this.activeStream = stream;
    if (this.trysteroRoom && typeof this.trysteroRoom.addStream === 'function') {
      try {
        this.trysteroRoom.addStream(stream);
      } catch (err) {
        console.warn('addStream error:', err);
      }
    }
  }

  public broadcastFile(fileData: TrackFileData) {
    if (this.sendFileAction && fileData.buffer) {
      try {
        this.sendFileAction(fileData.buffer, {
          metadata: {
            trackId: fileData.trackId,
            title: fileData.title,
            artist: fileData.artist,
            duration: fileData.duration,
            durationSeconds: fileData.durationSeconds,
            addedBy: fileData.addedBy,
            type: fileData.type,
          },
        }).catch(() => {});
      } catch (err) {
        console.warn('broadcastFile error:', err);
      }
    }
  }

  private startHeartbeat() {
    // Announce self immediately
    this.broadcast({
      type: 'PEER_PING',
      peerId: this.peerId,
      name: this.peerName,
      isHost: this.isHost,
      timestamp: performance.now(),
    });

    // If joining as non-host, automatically request room state from host once connections open
    if (!this.isHost) {
      setTimeout(() => {
        this.broadcast({
          type: 'REQUEST_ROOM_STATE',
          peerId: this.peerId,
        });
      }, 500);

      setTimeout(() => {
        this.broadcast({
          type: 'REQUEST_ROOM_STATE',
          peerId: this.peerId,
        });
      }, 1600);
    }

    // Ping every 2.5 seconds to maintain real active peer list across all devices
    this.heartbeatInterval = setInterval(() => {
      this.broadcast({
        type: 'PEER_PING',
        peerId: this.peerId,
        name: this.peerName,
        isHost: this.isHost,
        timestamp: performance.now(),
      });
    }, 2500);
  }

  private startServerSync() {
    const poll = async () => {
      if (this.isClosed) return;
      try {
        const res = await fetch('/api/rooms/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: this.roomCode,
            peerId: this.peerId,
            peerName: this.peerName,
            isHost: this.isHost,
            since: this.lastServerEventTime,
          }),
        });

        if (res.ok && !this.isClosed) {
          const data = await res.json();
          if (data.serverTime) {
            this.lastServerEventTime = data.serverTime;
          }

          // 1. Process active peers from server
          if (Array.isArray(data.peers) && this.onEventCallback) {
            for (const p of data.peers) {
              if (p.id !== this.peerId) {
                this.onEventCallback({
                  type: 'PEER_PING',
                  peerId: p.id,
                  name: p.name,
                  isHost: Boolean(p.isHost),
                  timestamp: performance.now(),
                });
              }
            }
          }

          // 2. Process unread events from other devices
          if (Array.isArray(data.events)) {
            for (const ev of data.events) {
              this.handleIncomingMessage(ev, 'server');
            }
          }
        }
      } catch {
        // Will retry on next heartbeat tick
      }
    };

    poll();
    this.serverPollInterval = setInterval(poll, 1200);
  }

  private handleIncomingMessage(event: SyncEvent, source: 'local' | 'webrtc' | 'server') {
    if (!event) return;

    // Ignore self-echoes
    if ('peerId' in event && event.peerId === this.peerId) {
      return;
    }

    // Deduplicate non-heartbeat events received across multiple transports (local/webrtc/server)
    // Never deduplicate PEER_PING or PEER_PONG because they keep the presence heartbeat active!
    const isHeartbeat = event.type === 'PEER_PING' || event.type === 'PEER_PONG';
    if (!isHeartbeat) {
      const eventKey =
        (event as any).id ||
        `${event.type}_${(event as any).sentAt || (event as any).serverTimestamp || (event as any).currentTime || ''}_${(event as any).trackId || (event as any).peerId || ''}`;
      if (eventKey && this.processedEventIds.has(eventKey)) {
        return;
      }
      if (eventKey) {
        this.processedEventIds.add(eventKey);
        if (this.processedEventIds.size > 200) {
          const first = this.processedEventIds.values().next().value;
          if (first) this.processedEventIds.delete(first);
        }
      }
    }

    // Handle ping/pong for real RTT measurement and peer discovery
    if (event.type === 'PEER_PING') {
      if (event.peerId !== this.peerId) {
        this.broadcast({
          type: 'PEER_PONG',
          peerId: this.peerId,
          name: this.peerName,
          isHost: this.isHost,
          origTimestamp: event.timestamp,
        });
      }
    } else if (event.type === 'PEER_PONG') {
      if (event.origTimestamp) {
        const roundTrip = performance.now() - event.origTimestamp;
        this.measuredRtt = Math.max(0.1, Math.round(roundTrip * 100) / 100);
      }
    }

    if (this.onEventCallback) {
      this.onEventCallback(event);
    }
  }

  public broadcast(event: SyncEvent) {
    // 1. Local BroadcastChannel
    if (this.channel) {
      try {
        this.channel.postMessage(event);
      } catch {}
    }

    // 2. Cross-device WebRTC DataChannel
    if (this.sendWebRtcAction) {
      try {
        this.sendWebRtcAction(event).catch(() => {});
      } catch {}
    }

    // 3. Reliable server event relay (ensures 100% cross-device delivery regardless of NAT/WebRTC blockers)
    try {
      fetch('/api/rooms/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: this.roomCode,
          peerId: this.peerId,
          peerName: this.peerName,
          isHost: this.isHost,
          event,
          since: this.lastServerEventTime,
        }),
      }).catch(() => {});
    } catch {}
  }

  public close() {
    this.isClosed = true;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.serverPollInterval) {
      clearInterval(this.serverPollInterval);
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(
          '/api/rooms/sync',
          JSON.stringify({
            code: this.roomCode,
            peerId: this.peerId,
            action: 'leave',
          })
        );
      } else {
        fetch('/api/rooms/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: this.roomCode,
            peerId: this.peerId,
            action: 'leave',
          }),
          keepalive: true,
        }).catch(() => {});
      }
    } catch {}

    this.broadcast({
      type: 'PEER_LEAVE',
      peerId: this.peerId,
    });
    if (this.channel) {
      try {
        this.channel.close();
      } catch {}
      this.channel = null;
    }
    if (this.trysteroRoom) {
      try {
        this.trysteroRoom.leave();
      } catch {}
      this.trysteroRoom = null;
    }
  }
}
