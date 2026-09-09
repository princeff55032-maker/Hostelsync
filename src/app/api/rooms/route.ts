import { NextResponse } from 'next/server';
import { Hostel } from '@/lib/types';
import { DEFAULT_MESS_MENU } from '@/lib/data';

const CLOUD_APP_KEY = 'hostelsync_rooms_v1';

// Use globalThis to persist activeRooms map across Next.js fast refresh / dev reloads / same-instance lambdas
const globalForRooms = globalThis as unknown as {
  activeRooms?: Map<string, { room: Hostel; updatedAt: number }>;
};

const activeRooms = globalForRooms.activeRooms ?? new Map<string, { room: Hostel; updatedAt: number }>();
// CRITICAL: Always bind to globalThis in both dev AND production (previously was skipped in production on Vercel)
globalForRooms.activeRooms = activeRooms;

function normalizeCode(raw: string): string {
  const cleanSuffix = (raw || '').trim().toUpperCase().replace(/^HS-/, '');
  return cleanSuffix.length === 4 ? `HS-${cleanSuffix}` : (raw || '').trim().toUpperCase();
}

function buildRoomFromMini(code: string, mini: { n?: string; c?: string; lk?: boolean }): Hostel {
  const spaceName = mini.n || `Space #${code.replace('HS-', '')}`;
  const creatorName = mini.c || 'Admin';

  return {
    code,
    name: spaceName,
    totalResidents: 1,
    totalRooms: 40,
    address: 'Hostel Campus, Wing A',
    warden: creatorName,
    isLocked: Boolean(mini.lk),
    residents: [
      { id: 'creator', name: creatorName, room: '101', status: 'In room', floor: 1, isUser: false },
    ],
    rooms: [
      { roomNumber: '101', floor: 1, capacity: 2, occupied: 1, residents: [creatorName] },
    ],
    announcements: [
      {
        id: `ann-${Date.now()}`,
        title: `Welcome to ${spaceName}!`,
        content: 'Synchronized community space for residents.',
        author: creatorName,
        time: 'Just now',
        tag: 'Official',
        pinned: true,
      },
    ],
    complaints: [],
    messMenu: DEFAULT_MESS_MENU,
    payments: {
      messDues: 0,
      roomMaintenance: 0,
      laundryCredits: 10,
      nextDueDate: '1st of next month',
      transactions: [],
    },
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawCode = searchParams.get('code') || '';
  const code = normalizeCode(rawCode);

  if (!code) {
    return NextResponse.json({ exists: false, room: null }, { status: 404 });
  }

  // 1. Check local in-memory Map
  if (activeRooms.has(code)) {
    const roomData = activeRooms.get(code)!;
    return NextResponse.json({ exists: true, room: roomData.room });
  }

  // 2. Query cloud KV store across Vercel instances
  try {
    const res = await fetch(
      `https://keyvalue.immanuel.co/api/KeyVal/GetValue/${CLOUD_APP_KEY}/${encodeURIComponent(code)}`,
      { signal: AbortSignal.timeout(3500) }
    );
    if (res.ok) {
      const rawText = await res.text();
      let cleaned = '';
      try {
        cleaned = JSON.parse(rawText || '""');
      } catch {
        cleaned = rawText.replace(/"/g, '').trim();
      }

      if (cleaned && cleaned !== '0' && typeof cleaned === 'string' && cleaned.length > 0) {
        try {
          const mini = JSON.parse(Buffer.from(cleaned, 'base64url').toString('utf8'));
          const reconstructed = buildRoomFromMini(code, mini);
          activeRooms.set(code, {
            room: reconstructed,
            updatedAt: Date.now(),
          });
          return NextResponse.json({ exists: true, room: reconstructed });
        } catch {
          // If decoding failed, check if it was raw name
          const reconstructed = buildRoomFromMini(code, { n: cleaned, c: 'Admin' });
          activeRooms.set(code, {
            room: reconstructed,
            updatedAt: Date.now(),
          });
          return NextResponse.json({ exists: true, room: reconstructed });
        }
      }
    }
  } catch (err) {
    console.warn('Cloud KV lookup notice:', err);
  }

  return NextResponse.json({ exists: false, room: null }, { status: 404 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const room = body.room as Hostel;
    if (!room || !room.code) {
      return NextResponse.json({ error: 'Invalid room data' }, { status: 400 });
    }
    const code = normalizeCode(room.code);
    const normalizedRoom = { ...room, code };

    activeRooms.set(code, {
      room: normalizedRoom,
      updatedAt: Date.now(),
    });

    // Also persist mini metadata to cloud KV so any Vercel instance/device can find it
    try {
      const mini = {
        n: normalizedRoom.name,
        c: normalizedRoom.warden || 'Admin',
        lk: Boolean(normalizedRoom.isLocked),
      };
      const b64 = Buffer.from(JSON.stringify(mini)).toString('base64url');
      fetch(
        `https://keyvalue.immanuel.co/api/KeyVal/UpdateValue/${CLOUD_APP_KEY}/${encodeURIComponent(code)}/${b64}`,
        { method: 'POST', signal: AbortSignal.timeout(3500) }
      ).catch(() => {});
    } catch {}

    return NextResponse.json({ success: true, code });
  } catch {
    return NextResponse.json({ error: 'Failed to save room' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawCode = searchParams.get('code') || '';
  const code = normalizeCode(rawCode);

  activeRooms.delete(code);

  try {
    fetch(
      `https://keyvalue.immanuel.co/api/KeyVal/UpdateValue/${CLOUD_APP_KEY}/${encodeURIComponent(code)}/0`,
      { method: 'POST', signal: AbortSignal.timeout(3500) }
    ).catch(() => {});
  } catch {}

  return NextResponse.json({ success: true });
}
