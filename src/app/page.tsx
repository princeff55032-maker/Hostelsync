'use client';

import React, { useState } from 'react';
import { useHostelStore } from '@/lib/store';
import { JoinCard } from '@/components/JoinCard';
import { HostelRoom } from '@/components/HostelRoom';
import { CreateHostelModal } from '@/components/CreateHostelModal';
import { AboutModal } from '@/components/AboutModal';

export default function Home() {
  const {
    isInitialized,
    userName,
    changeUserName,
    regenerateUserName,
    findHostel,
    createHostel,
    joinHostel,
    leaveHostel,
    deleteHostel,
    activeHostel,
    addAnnouncement,
    addComplaint,
  } = useHostelStore();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  // Auto-join room if scanned via QR code (?room=HS-XXXX)
  React.useEffect(() => {
    if (!isInitialized) return;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room');
      if (roomParam) {
        joinHostel(roomParam);
      }
    }
  }, [isInitialized, joinHostel]);

  // Prevent flash before local storage initializes
  if (!isInitialized) {
    return (
      <main className="h-screen w-screen flex items-center justify-center bg-[#0a0a0b] text-neutral-500 text-xs">
        <div className="w-4 h-4 rounded-full border-2 border-neutral-700 border-t-white animate-spin" />
      </main>
    );
  }

  return (
    <main className="h-screen w-screen overflow-hidden bg-[#0a0a0b] text-[#ededed] flex flex-col selection:bg-neutral-800 selection:text-white">
      {activeHostel ? (
        <HostelRoom
          hostel={activeHostel}
          userName={userName}
          onLeave={leaveHostel}
          onDeleteRoom={() => deleteHostel(activeHostel.code)}
          onAddAnnouncement={(title, content, tag) =>
            addAnnouncement(activeHostel.code, title, content, tag)
          }
          onAddComplaint={(title, category, room) =>
            addComplaint(activeHostel.code, title, category, room)
          }
        />
      ) : (
        <div className="flex-1 flex flex-col justify-center overflow-y-auto">
          <JoinCard
            userName={userName}
            onNameChange={changeUserName}
            onRegenerate={regenerateUserName}
            findHostel={findHostel}
            onJoin={(code) => joinHostel(code)}
            onOpenCreate={() => setIsCreateOpen(true)}
            onOpenAbout={() => setIsAboutOpen(true)}
          />
        </div>
      )}

      {/* Creation Modal */}
      <CreateHostelModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        defaultUserName={userName}
        onCreate={createHostel}
        onEnterHostel={(code) => joinHostel(code)}
      />

      {/* About Modal */}
      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />
    </main>
  );
}
