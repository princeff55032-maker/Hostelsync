'use client';

// Real-time synchronization layer using Web BroadcastChannel and high-resolution timer
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
  private roomCode: string;
  public peerId: string;
  public peerName: string;
  public isHost: boolean;
  private onEventCallback: ((event: SyncEvent) => void) | null = null;
  private heartbeatInterval: any = null;
  public measuredRtt: number = 2.4; // Initial estimate in ms
  public measuredOffset: number = 0; // Clock offset in ms

  constructor(roomCode: string, peerName: string, isHost: boolean = false) {
    this.roomCode = roomCode;
    this.peerName = peerName;
    this.isHost = isHost;
    this.peerId = `peer_${Math.random().toString(36).substring(2, 9)}`;

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(`hostelsync_room_${roomCode}`);
      this.channel.onmessage = (e) => this.handleIncomingMessage(e.data);
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

    // Ping every 2.5 seconds to maintain real active peer list
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

  private handleIncomingMessage(event: SyncEvent) {
    if (!event) return;

    // Handle ping/pong for real RTT measurement
    if (event.type === 'PEER_PING') {
      if (event.peerId !== this.peerId) {
        // Send back PONG
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
    if (this.channel) {
      try {
        this.channel.postMessage(event);
      } catch (err) {
        console.error('Broadcast error:', err);
      }
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
      this.channel.close();
      this.channel = null;
    }
  }
}
