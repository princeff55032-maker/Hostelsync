import { NextResponse } from 'next/server';
import { Hostel } from '@/lib/types';

// Use globalThis to persist activeRooms map across Next.js fast refresh / dev reloads
const globalForRooms = globalThis as unknown as {
  activeRooms?: Map<string, { room: Hostel; updatedAt: number }>;
};

const activeRooms = globalForRooms.activeRooms ?? new Map<string, { room: Hostel; updatedAt: number }>();
if (process.env.NODE_ENV !== 'production') {
  globalForRooms.activeRooms = activeRooms;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawCode = searchParams.get('code') || '';
  const cleanSuffix = rawCode.trim().toUpperCase().replace(/^HS-/, '');
  const code = cleanSuffix.length === 4 ? `HS-${cleanSuffix}` : rawCode.trim().toUpperCase();

  if (!code || !activeRooms.has(code)) {
    return NextResponse.json({ exists: false, room: null }, { status: 404 });
  }

  const roomData = activeRooms.get(code)!;
  return NextResponse.json({ exists: true, room: roomData.room });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const room = body.room as Hostel;
    if (!room || !room.code) {
      return NextResponse.json({ error: 'Invalid room data' }, { status: 400 });
    }
    const cleanSuffix = room.code.trim().toUpperCase().replace(/^HS-/, '');
    const code = cleanSuffix.length === 4 ? `HS-${cleanSuffix}` : room.code.trim().toUpperCase();
    const normalizedRoom = { ...room, code };

    activeRooms.set(code, {
      room: normalizedRoom,
      updatedAt: Date.now(),
    });

    return NextResponse.json({ success: true, code });
  } catch {
    return NextResponse.json({ error: 'Failed to save room' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawCode = searchParams.get('code') || '';
  const cleanSuffix = rawCode.trim().toUpperCase().replace(/^HS-/, '');
  const code = cleanSuffix.length === 4 ? `HS-${cleanSuffix}` : rawCode.trim().toUpperCase();

  activeRooms.delete(code);
  return NextResponse.json({ success: true });
}
