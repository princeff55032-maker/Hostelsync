'use client';

import { useState, useEffect } from 'react';
import { Hostel, Announcement, Complaint, Resident } from './types';
import { INITIAL_HOSTELS, DEFAULT_MESS_MENU, getRandomName, generateHostelCode } from './data';

const STORAGE_KEYS = {
  HOSTELS: 'hostelsync_hostels_v1',
  USER_NAME: 'hostelsync_username_v1',
  ACTIVE_CODE: 'hostelsync_active_code_v1',
};

export function useHostelStore() {
  const [userName, setUserName] = useState<string>('');
  const [hostels, setHostels] = useState<Record<string, Hostel>>(INITIAL_HOSTELS);
  const [activeHostelCode, setActiveHostelCode] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // Load state from localStorage on mount
  useEffect(() => {
    try {
      const storedName = localStorage.getItem(STORAGE_KEYS.USER_NAME);
      if (storedName && storedName !== 'Prince' && storedName !== 'Vikram') {
        setUserName(storedName);
      } else {
        localStorage.removeItem(STORAGE_KEYS.USER_NAME);
        setUserName('');
      }

      const storedHostels = localStorage.getItem(STORAGE_KEYS.HOSTELS);
      if (storedHostels) {
        const parsed = JSON.parse(storedHostels);
        const cleaned: Record<string, Hostel> = {};
        for (const [k, v] of Object.entries(parsed as Record<string, Hostel>)) {
          if (v && v.name !== 'Green Valley Hostel' && v.name !== 'North Campus Residency') {
            cleaned[k] = v;
          }
        }
        setHostels(cleaned);
        localStorage.setItem(STORAGE_KEYS.HOSTELS, JSON.stringify(cleaned));
      }

      // On browser reload/mount, clear active room session so refresh resets room state
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_CODE);
      setActiveHostelCode(null);
    } catch {
      // Ignore storage errors in restricted contexts
    } finally {
      setIsInitialized(true);
    }
  }, []);

  const changeUserName = (name: string) => {
    const clean = name.trim();
    setUserName(clean);
    try {
      if (clean) {
        localStorage.setItem(STORAGE_KEYS.USER_NAME, clean);
      } else {
        localStorage.removeItem(STORAGE_KEYS.USER_NAME);
      }
    } catch {}
  };

  const regenerateUserName = () => {
    // Left for backwards-compatibility if referenced
  };

  const findHostel = (code: string): Hostel | null => {
    const raw = code.trim().toUpperCase();
    const cleanSuffix = raw.replace(/^HS-/, '');
    const formatted = cleanSuffix.length === 4 ? `HS-${cleanSuffix}` : raw;

    const existing = hostels[formatted] || hostels[raw] || hostels[cleanSuffix];
    if (existing) {
      return existing;
    }
    return null;
  };

  const findHostelAsync = async (code: string): Promise<Hostel | null> => {
    const local = findHostel(code);
    if (local) return local;

    const raw = code.trim().toUpperCase();
    const cleanSuffix = raw.replace(/^HS-/, '');
    const formatted = cleanSuffix.length === 4 ? `HS-${cleanSuffix}` : raw;

    try {
      const res = await fetch(`/api/rooms?code=${encodeURIComponent(formatted)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.exists && data.room) {
          setHostels((prev) => {
            const updated = { ...prev, [formatted]: data.room };
            try {
              localStorage.setItem(STORAGE_KEYS.HOSTELS, JSON.stringify(updated));
            } catch {}
            return updated;
          });
          return data.room;
        }
      }
    } catch {
      // Ignore network errors
    }

    return null;
  };

  const createHostel = (name: string, residentName?: string, roomsCount = 40): { code: string; hostel: Hostel } => {
    const code = generateHostelCode();
    const creatorName = (residentName || userName || '').trim() || 'Admin';
    const spaceName = name.trim() || `Space #${code.replace('HS-', '')}`;

    if (creatorName && creatorName !== userName) {
      setUserName(creatorName);
      try {
        localStorage.setItem(STORAGE_KEYS.USER_NAME, creatorName);
      } catch {}
    }

    const newHostel: Hostel = {
      code,
      name: spaceName,
      totalResidents: 1,
      totalRooms: roomsCount,
      address: 'Hostel Campus, Wing A',
      warden: creatorName,
      residents: [
        { id: 'creator', name: creatorName, room: '101', status: 'In room', floor: 1, isUser: true },
      ],
      rooms: [
        { roomNumber: '101', floor: 1, capacity: 2, occupied: 1, residents: [creatorName] },
      ],
      announcements: [
        {
          id: `ann-${Date.now()}`,
          title: `Welcome to ${spaceName}!`,
          content: 'This HostelSync space was just created. Share your code with fellow residents to collaborate.',
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

    const updated = { ...hostels, [code]: newHostel };
    setHostels(updated);
    try {
      localStorage.setItem(STORAGE_KEYS.HOSTELS, JSON.stringify(updated));
      sessionStorage.setItem(`hostelsync_creator_${code}`, 'true');
      localStorage.setItem(`hostelsync_creator_${code}`, 'true');
    } catch {}

    // Register on server for cross-device discovery
    try {
      fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: newHostel }),
      }).catch(() => {});
    } catch {}

    return { code, hostel: newHostel };
  };

  const enterCreatedHostel = (code: string) => {
    const raw = (code || '').trim().toUpperCase();
    const cleanSuffix = raw.replace(/^HS-/, '');
    const cleanCode = cleanSuffix.length === 4 ? `HS-${cleanSuffix}` : (raw.startsWith('HS-') ? raw : `HS-${raw}`);

    setActiveHostelCode(cleanCode);
    try {
      sessionStorage.setItem(`hostelsync_creator_${cleanCode}`, 'true');
      localStorage.setItem(`hostelsync_creator_${cleanCode}`, 'true');
      localStorage.setItem(STORAGE_KEYS.ACTIVE_CODE, cleanCode);
    } catch {}
    return true;
  };

  const joinHostel = async (code: string): Promise<boolean> => {
    const raw = (code || '').trim().toUpperCase();
    const cleanSuffix = raw.replace(/^HS-/, '');
    const cleanCode = cleanSuffix.length === 4 ? `HS-${cleanSuffix}` : (raw.startsWith('HS-') ? raw : `HS-${raw}`);

    let targetHostel: Hostel | null = hostels[cleanCode] || hostels[raw] || findHostel(cleanCode);
    if (!targetHostel) {
      targetHostel = await findHostelAsync(cleanCode);
    }

    if (targetHostel) {
      const updated = { ...hostels, [cleanCode]: targetHostel };
      setHostels(updated);
      setActiveHostelCode(cleanCode);
      try {
        localStorage.setItem(STORAGE_KEYS.HOSTELS, JSON.stringify(updated));
        localStorage.setItem(STORAGE_KEYS.ACTIVE_CODE, cleanCode);
      } catch {}
      return true;
    }
    return false;
  };

  const leaveHostel = () => {
    if (activeHostelCode) {
      try {
        sessionStorage.removeItem(`hostelsync_creator_${activeHostelCode}`);
      } catch {}
    }
    setActiveHostelCode(null);
    try {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_CODE);
    } catch {}
  };

  const deleteHostel = (code: string) => {
    const raw = (code || '').trim().toUpperCase();
    const cleanSuffix = raw.replace(/^HS-/, '');
    const cleanCode = `HS-${cleanSuffix}`;

    setHostels((prev) => {
      const updated = { ...prev };
      delete updated[raw];
      delete updated[cleanCode];
      delete updated[cleanSuffix];
      try {
        localStorage.setItem(STORAGE_KEYS.HOSTELS, JSON.stringify(updated));
      } catch {}
      return updated;
    });

    try {
      fetch(`/api/rooms?code=${encodeURIComponent(cleanCode)}`, { method: 'DELETE' }).catch(() => {});
    } catch {}

    setActiveHostelCode((curr) => {
      if (curr === raw || curr === cleanCode || curr === cleanSuffix) {
        try {
          localStorage.removeItem(STORAGE_KEYS.ACTIVE_CODE);
        } catch {}
        return null;
      }
      return curr;
    });
  };

  const addAnnouncement = (code: string, title: string, content: string, tag: Announcement['tag'] = 'General') => {
    const formatted = code.trim().toUpperCase();
    const hostel = hostels[formatted];
    if (!hostel) return;

    const newAnn: Announcement = {
      id: `ann-${Date.now()}`,
      title,
      content,
      author: userName,
      time: 'Just now',
      tag,
      pinned: false,
    };

    const updatedHostel = {
      ...hostel,
      announcements: [newAnn, ...hostel.announcements],
    };

    const updated = { ...hostels, [formatted]: updatedHostel };
    setHostels(updated);
    try {
      localStorage.setItem(STORAGE_KEYS.HOSTELS, JSON.stringify(updated));
    } catch {}
  };

  const addComplaint = (code: string, title: string, category: Complaint['category'], room: string) => {
    const formatted = code.trim().toUpperCase();
    const hostel = hostels[formatted];
    if (!hostel) return;

    const newComplaint: Complaint = {
      id: `c-${Date.now()}`,
      title,
      category,
      room: room || 'My Room',
      status: 'Pending',
      createdBy: `${userName} (${room || 'Resident'})`,
      time: 'Just now',
    };

    const updatedHostel = {
      ...hostel,
      complaints: [newComplaint, ...hostel.complaints],
    };

    const updated = { ...hostels, [formatted]: updatedHostel };
    setHostels(updated);
    try {
      localStorage.setItem(STORAGE_KEYS.HOSTELS, JSON.stringify(updated));
    } catch {}
  };

  const activeHostel: Hostel | null = activeHostelCode
    ? hostels[activeHostelCode] || findHostel(activeHostelCode) || null
    : null;

  const isHost =
    typeof window !== 'undefined' && activeHostelCode
      ? sessionStorage.getItem(`hostelsync_creator_${activeHostelCode}`) === 'true' ||
        localStorage.getItem(`hostelsync_creator_${activeHostelCode}`) === 'true' ||
        Boolean(activeHostel?.warden && userName && activeHostel.warden.trim().toLowerCase() === userName.trim().toLowerCase())
      : false;

  return {
    isInitialized,
    userName,
    changeUserName,
    regenerateUserName,
    hostels,
    findHostel,
    findHostelAsync,
    createHostel,
    enterCreatedHostel,
    joinHostel,
    leaveHostel,
    deleteHostel,
    activeHostelCode,
    activeHostel,
    isHost,
    addAnnouncement,
    addComplaint,
  };
}
