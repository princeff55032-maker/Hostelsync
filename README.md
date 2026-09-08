# HostelSync

> Multi-device synchronized music listening, YouTube player, 2D studio spatial audio, and room DJ permission controls. Built with Next.js 16 (App Router), Web Audio API, and Tailwind CSS.

## Features

- **Multi-Device Synchronized Audio**: Real-time room sync across tabs and devices using BroadcastChannel and high-resolution timing.
- **Full YouTube Player Integration**: Bidirectional time polling, timeline seeking, real-time volume modulation, and state synchronization.
- **2D Spatial Audio Studio Tab**: Interactive 2D studio grid with draggable speaker and headphone nodes, sub-pixel precision, distance attenuation, and smooth Rotation Orbit.
- **Studio Music Filters**: Instant acoustic filter presets (Studio Flat, Bass Boost, Vocal Boost, Lo-Fi Vinyl, Next Door, Nightclub) with Low-Pass, High-Pass, Bass EQ (-12dB to +12dB), and Treble EQ (-12dB to +12dB).
- **DJ & Room Permissions**: Room host controls playback permissions (Everyone vs Admins), add music permissions (Everyone vs Admins), and can promote/demote peers to Admin with real-time permission sync.
- **QR Code Invites**: Generate and scan room QR codes for instant 1-click room joining.

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to import your GitHub repository into the [Vercel Platform](https://vercel.com/new).

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for details.
