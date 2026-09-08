import { Hostel, MessDay } from './types';

export const RANDOM_NAMES = [
  'Prince',
  'Aarav',
  'Rohan',
  'Ananya',
  'Dev',
  'Vikram',
  'Kabir',
  'Meera',
  'Priya',
  'Tanvi',
  'Aditya',
  'Ishan',
  'Arjun',
  'Sneha',
  'Neha',
  'Aryan',
  'Rishi',
  'Tara',
];

export const DEFAULT_MESS_MENU: MessDay[] = [
  {
    day: 'Monday',
    isToday: true,
    breakfast: 'Aloo Paratha, Curd, Pickle, Tea / Coffee',
    lunch: 'Rajma Masala, Steamed Basmati Rice, Boondi Raita, Salad',
    snacks: 'Veg Cutlet, Green Chutney, Masala Chai',
    dinner: 'Paneer Butter Masala, Tawa Roti, Dal Tadka, Gulab Jamun',
    timing: { breakfast: '7:30 - 9:30 AM', lunch: '12:30 - 2:30 PM', snacks: '5:00 - 6:15 PM', dinner: '8:00 - 10:00 PM' },
  },
  {
    day: 'Tuesday',
    breakfast: 'Poha with Peanuts, Sev, Mint Chutney, Tea / Milk',
    lunch: 'Kadhi Pakora, Jeera Rice, Bhindi Do Pyaza, Papad',
    snacks: 'Samosa, Tamarind Chutney, Filter Coffee',
    dinner: 'Mix Veg Curry, Dal Makhani, Phulka, Fruit Custard',
    timing: { breakfast: '7:30 - 9:30 AM', lunch: '12:30 - 2:30 PM', snacks: '5:00 - 6:15 PM', dinner: '8:00 - 10:00 PM' },
  },
  {
    day: 'Wednesday',
    breakfast: 'Idli & Medu Vada, Sambar, Coconut Chutney',
    lunch: 'Chole Bhature / Steamed Rice, Onion Lemon Salad, Buttermilk',
    snacks: 'Bread Pakora, Green Tea / Chai',
    dinner: 'Egg Curry / Shahi Paneer, Jeera Rice, Chapati, Ice Cream',
    timing: { breakfast: '7:30 - 9:30 AM', lunch: '12:30 - 2:30 PM', snacks: '5:00 - 6:15 PM', dinner: '8:00 - 10:00 PM' },
  },
  {
    day: 'Thursday',
    breakfast: 'Masala Dosa, Tomato Chutney, Tea / Milk',
    lunch: 'Veg Biryani, Mirchi Ka Salan, Cucumber Raita',
    snacks: 'Bhel Puri, Masala Tea',
    dinner: 'Palak Paneer, Yellow Dal Fry, Warm Rotis, Kheer',
    timing: { breakfast: '7:30 - 9:30 AM', lunch: '12:30 - 2:30 PM', snacks: '5:00 - 6:15 PM', dinner: '8:00 - 10:00 PM' },
  },
  {
    day: 'Friday',
    breakfast: 'Upma with Coconut Chutney, Banana, Tea / Coffee',
    lunch: 'Dal Makhani, Jeera Rice, Aloo Gobi, Roti, Salad',
    snacks: 'Onion Pakoda, Mint Chutney, Masala Chai',
    dinner: 'Kadhai Paneer, Butter Naan, Veg Pulao, Rasgulla',
    timing: { breakfast: '7:30 - 9:30 AM', lunch: '12:30 - 2:30 PM', snacks: '5:00 - 6:15 PM', dinner: '8:00 - 10:00 PM' },
  },
  {
    day: 'Saturday',
    breakfast: 'Puri Bhaji, Halwa, Tea / Milk',
    lunch: 'Sambar Rice, Potato Roast, Curd Rice, Appalam',
    snacks: 'Dhokla with Mustard Tempering, Masala Chai',
    dinner: 'Pav Bhaji with Butter Pav, Sweet Lassi',
    timing: { breakfast: '7:30 - 10:00 AM', lunch: '12:30 - 2:30 PM', snacks: '5:00 - 6:30 PM', dinner: '8:00 - 10:00 PM' },
  },
  {
    day: 'Sunday',
    breakfast: 'Chole Kulche, Butter, Pickled Onions, Coffee',
    lunch: 'Special Feast: Paneer Tikka / Chicken Curry, Naan, Pulao',
    snacks: 'Biscuits, Tea / Cold Coffee',
    dinner: 'Light Khichdi, Kadhi, Roasted Papad, Moong Dal Halwa',
    timing: { breakfast: '8:00 - 10:30 AM', lunch: '1:00 - 3:00 PM', snacks: '5:00 - 6:30 PM', dinner: '8:00 - 10:00 PM' },
  },
];

// Clean rooms store with 0 fake mock hostels
export const INITIAL_HOSTELS: Record<string, Hostel> = {};

export function getRandomName(): string {
  return RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
}

export function generateHostelCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `HS-${rand}`;
}
