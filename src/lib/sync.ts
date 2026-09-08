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

export type SyncEvent =
  | { type: 'PEER_PING'; peerId: string; name: string; isHost: boolean; timestamp: number }
  | { type: 'PEER_PONG'; peerId: string; name: string; origTimestamp: number }
  | { type: 'PEER_LEAVE'; peerId: string }
  | { type: 'AUDIO_PLAY'; trackId: string; currentTime: number; serverTimestamp: number }
  | { type: 'AUDIO_PAUSE'; trackId: string; currentTime: number }
  | { type: 'AUDIO_SEEK'; currentTime: number }
  | { type: 'QUEUE_ADD'; track: any }
  | { type: 'QUEUE_CLEAR' }
  | { type: 'CHAT_MESSAGE'; message: any }
  | {
      type: 'PERMISSIONS_UPDATE';
      playbackPermission: 'everyone' | 'admins';
      addMusicPermission: 'everyone' | 'admins';
      adminPeerIds: string[];
    };

export class RoomSync {
  private channel: BroadcastChannel | null = null;
  private trysteroRoom: any = null;
  private sendWebRtcAction: ((data: any) => Promise<any>) | null = null;
  private roomCode: string;
  public peerId: string;
  public peerName: string;
  public isHost: boolean;
  private onEventCallback: ((event: SyncEvent) => void) | null = null;
  private heartbeatInterval: any = null;
  public measuredRtt: number = 2.4;
  public measuredOffset: number = 0;
  private processedEvents: Set<string> = new Set();

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
        const action = room.makeAction<any>('sync_action');
        this.sendWebRtcAction = (data: any) => action.send(data);

        action.onMessage = (data: any) => {
          if (data) {
            this.handleIncomingMessage(data as SyncEvent, 'webrtc');
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
    }
  }

  public setEventHandler(callback: (event: SyncEvent) => void) {
    this.onEventCallback = callback;
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

  private handleIncomingMessage(event: SyncEvent, source: 'local' | 'webrtc') {
    if (!event) return;

    // Ignore self-echoes
    if ('peerId' in event && event.peerId === this.peerId) {
      return;
    }

    // Handle ping/pong for real RTT measurement and peer discovery
    if (event.type === 'PEER_PING') {
      if (event.peerId !== this.peerId) {
        this.broadcast({
          type: 'PEER_PONG',
          peerId: this.peerId,
          name: this.peerName,
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
  }

  public close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
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
