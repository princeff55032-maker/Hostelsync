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
    const formatted = code.trim().toUpperCase();
    const existing = hostels[formatted];
    if (existing) {
      if (existing.name === 'Green Valley Hostel' || existing.name === 'North Campus Residency') {
        return {
          ...existing,
          name: `Room #${formatted.replace('HS-', '')}`,
        };
      }
      return existing;
    }

    // Auto-create room dynamically when joining by any 4-character code (BeatSync behavior)
    const cleanSuffix = formatted.replace(/^HS-/, '');
    if (cleanSuffix.length === 4) {
      const dynamicRoom: Hostel = {
        code: formatted.startsWith('HS-') ? formatted : `HS-${formatted}`,
        name: `Room #${cleanSuffix}`,
        totalResidents: 1,
        totalRooms: 40,
        address: 'HostelSync Space',
        warden: 'Admin',
        residents: [{ id: 'creator', name: userName, room: '101', status: 'In room', floor: 1, isUser: true }],
        rooms: [{ roomNumber: '101', floor: 1, capacity: 2, occupied: 1, residents: [userName] }],
        announcements: [],
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
      return dynamicRoom;
    }

    return null;
  };

  const createHostel = (name: string, residentName?: string, roomsCount = 40): { code: string; hostel: Hostel } => {
    const code = generateHostelCode();
    const creatorName = residentName || userName;
    const spaceName = name.trim() || `Space #${code.replace('HS-', '')}`;

    const newHostel: Hostel = {
      code,
      name: spaceName,
      totalResidents: 1,
      totalRooms: roomsCount,
      address: 'Hostel Campus, Wing A',
      warden: 'Campus Administrator',
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
    } catch {}

    return { code, hostel: newHostel };
  };

  const joinHostel = (code: string) => {
    const raw = (code || '').trim().toUpperCase();
    const cleanSuffix = raw.replace(/^HS-/, '');
    const cleanCode = cleanSuffix.length === 4 ? `HS-${cleanSuffix}` : (raw.startsWith('HS-') ? raw : `HS-${raw}`);

    let targetHostel = hostels[cleanCode] || hostels[raw] || findHostel(cleanCode) || findHostel(raw);

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

  return {
    isInitialized,
    userName,
    changeUserName,
    regenerateUserName,
    hostels,
    findHostel,
    createHostel,
    joinHostel,
    leaveHostel,
    deleteHostel,
    activeHostelCode,
    activeHostel,
    addAnnouncement,
    addComplaint,
  };
}
