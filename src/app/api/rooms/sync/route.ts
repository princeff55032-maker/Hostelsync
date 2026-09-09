import { NextResponse } from 'next/server';

interface ActivePeer {
  id: string;
  name: string;
  isHost: boolean;
  lastSeen: number;
}

interface StoredEvent {
  id: string;
  senderPeerId: string;
  event: any;
  timestamp: number;
}

const globalForSync = globalThis as unknown as {
  roomPeers?: Map<string, Map<string, ActivePeer>>;
  roomEvents?: Map<string, StoredEvent[]>;
};

const roomPeers = globalForSync.roomPeers ?? new Map<string, Map<string, ActivePeer>>();
const roomEvents = globalForSync.roomEvents ?? new Map<string, StoredEvent[]>();

if (process.env.NODE_ENV !== 'production') {
  globalForSync.roomPeers = roomPeers;
  globalForSync.roomEvents = roomEvents;
}

function normalizeCode(raw: string): string {
  const cleanSuffix = (raw || '').trim().toUpperCase().replace(/^HS-/, '');
  return cleanSuffix.length === 4 ? `HS-${cleanSuffix}` : (raw || '').trim().toUpperCase();
}

function getActivePeers(code: string): ActivePeer[] {
  const peersMap = roomPeers.get(code);
  if (!peersMap) return [];
  const now = Date.now();
  const alive: ActivePeer[] = [];
  for (const [id, peer] of peersMap.entries()) {
    // 15-second heartbeat window
    if (now - peer.lastSeen < 15000) {
      alive.push(peer);
    } else {
      peersMap.delete(id);
    }
  }
  return alive;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawCode = searchParams.get('code') || '';
  const peerId = searchParams.get('peerId') || '';
  const peerName = searchParams.get('peerName') || '';
  const isHost = searchParams.get('isHost') === 'true';
  const since = parseInt(searchParams.get('since') || '0', 10);
  const code = normalizeCode(rawCode);

  if (!code) {
    return NextResponse.json({ error: 'Missing room code' }, { status: 400 });
  }

  // Touch current peer lastSeen if peerId is passed
  if (peerId) {
    let peersMap = roomPeers.get(code);
    if (!peersMap) {
      peersMap = new Map<string, ActivePeer>();
      roomPeers.set(code, peersMap);
    }
    peersMap.set(peerId, {
      id: peerId,
      name: peerName || 'Resident',
      isHost,
      lastSeen: Date.now(),
    });
  }

  const peers = getActivePeers(code);
  const eventsList = roomEvents.get(code) || [];
  const unreadEvents = eventsList
    .filter((e) => e.timestamp > since && e.senderPeerId !== peerId)
    .map((e) => e.event);

  return NextResponse.json({
    success: true,
    peers,
    events: unreadEvents,
    serverTime: Date.now(),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawCode = body.code || '';
    const peerId = body.peerId || '';
    const peerName = body.peerName || '';
    const isHost = Boolean(body.isHost);
    const action = body.action || 'ping'; // 'ping' | 'leave' | 'event'
    const incomingEvent = body.event;
    const since = typeof body.since === 'number' ? body.since : 0;
    const code = normalizeCode(rawCode);

    if (!code || !peerId) {
      return NextResponse.json({ error: 'Missing code or peerId' }, { status: 400 });
    }

    let peersMap = roomPeers.get(code);
    if (!peersMap) {
      peersMap = new Map<string, ActivePeer>();
      roomPeers.set(code, peersMap);
    }

    if (action === 'leave') {
      peersMap.delete(peerId);
      // Record leave event for other devices
      let eventsList = roomEvents.get(code);
      if (!eventsList) {
        eventsList = [];
        roomEvents.set(code, eventsList);
      }
      eventsList.push({
        id: `ev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        senderPeerId: peerId,
        event: { type: 'PEER_LEAVE', peerId },
        timestamp: Date.now(),
      });
      return NextResponse.json({ success: true, peers: getActivePeers(code) });
    }

    // Update active peer
    peersMap.set(peerId, {
      id: peerId,
      name: peerName || 'Resident',
      isHost,
      lastSeen: Date.now(),
    });

    // Record incoming broadcast event
    if (incomingEvent) {
      let eventsList = roomEvents.get(code);
      if (!eventsList) {
        eventsList = [];
        roomEvents.set(code, eventsList);
      }
      eventsList.push({
        id: `ev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        senderPeerId: peerId,
        event: incomingEvent,
        timestamp: Date.now(),
      });
      // Cap at 100 recent events
      if (eventsList.length > 100) {
        roomEvents.set(code, eventsList.slice(-100));
      }
    }

    const peers = getActivePeers(code);
    const eventsList = roomEvents.get(code) || [];
    const unreadEvents = eventsList
      .filter((e) => e.timestamp > since && e.senderPeerId !== peerId)
      .map((e) => e.event);

    return NextResponse.json({
      success: true,
      peers,
      events: unreadEvents,
      serverTime: Date.now(),
    });
  } catch {
    return NextResponse.json({ error: 'Server sync error' }, { status: 500 });
  }
}
