export interface Resident {
  id: string;
  name: string;
  room: string;
  status: 'In room' | 'Studying' | 'Mess' | 'Library' | 'Out';
  floor: number;
  isUser?: boolean;
  avatarSeed?: string;
}

export interface HostelRoomItem {
  roomNumber: string;
  floor: number;
  capacity: number;
  occupied: number;
  residents: string[];
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  author: string;
  time: string;
  tag: 'Official' | 'Mess' | 'Maintenance' | 'General';
  pinned?: boolean;
}

export interface Complaint {
  id: string;
  title: string;
  category: 'Plumbing' | 'Electricity' | 'WiFi' | 'Cleanliness' | 'Noise' | 'Other';
  room: string;
  status: 'Pending' | 'In Progress' | 'Resolved';
  createdBy: string;
  time: string;
}

export interface MessDay {
  day: string;
  isToday?: boolean;
  breakfast: string;
  lunch: string;
  snacks: string;
  dinner: string;
  timing: {
    breakfast: string;
    lunch: string;
    snacks: string;
    dinner: string;
  };
}

export interface PaymentInfo {
  messDues: number;
  roomMaintenance: number;
  laundryCredits: number;
  nextDueDate: string;
  transactions: {
    id: string;
    title: string;
    amount: number;
    date: string;
    status: 'Paid' | 'Pending';
  }[];
}

export interface Hostel {
  code: string;
  name: string;
  totalResidents: number;
  totalRooms: number;
  address: string;
  warden: string;
  residents: Resident[];
  rooms: HostelRoomItem[];
  announcements: Announcement[];
  complaints: Complaint[];
  messMenu: MessDay[];
  payments: PaymentInfo;
}
