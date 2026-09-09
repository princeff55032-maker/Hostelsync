'use client';

import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  Link as LinkIcon,
  Music,
  Check,
  FileAudio,
  AlertCircle,
  Play,
  Globe,
  Radio,
  Loader2,
  Lock,
} from 'lucide-react';
import { getYouTubeVideoId, fetchYouTubeVideoInfo } from '@/lib/youtube';

export interface AddedTrackData {
  title: string;
  artist: string;
  duration: string;
  durationSeconds: number;
  sourceType: 'device' | 'youtube' | 'soundcloud' | 'stream';
  url?: string;
  file?: File;
}

interface UploadAudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTrack: (track: AddedTrackData) => void;
  userName: string;
  canAddMusic?: boolean;
}

export function UploadAudioModal({
  isOpen,
  onClose,
  onAddTrack,
  userName,
  canAddMusic = true,
}: UploadAudioModalProps) {
  const [activeTab, setActiveTab] = useState<'device' | 'link'>('device');

  // Device file state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileDuration, setFileDuration] = useState<number>(180);
  const [fileTitle, setFileTitle] = useState<string>('');
  const [fileArtist, setFileArtist] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Link state
  const [linkUrl, setLinkUrl] = useState<string>('');
  const [linkTitle, setLinkTitle] = useState<string>('');
  const [linkArtist, setLinkArtist] = useState<string>('');
  const [linkPlatform, setLinkPlatform] = useState<'youtube' | 'soundcloud' | 'stream' | 'other'>('youtube');
  const [isLoadingInfo, setIsLoadingInfo] = useState<boolean>(false);

  if (!isOpen) return null;

  // Process chosen audio file
  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|ogg|m4a|flac|aac)$/i)) {
      alert('Please select a valid audio file (MP3, WAV, M4A, OGG, FLAC).');
      return;
    }

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setFileUrl(objectUrl);

    // Clean name for title
    const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    setFileTitle(cleanName);
    setFileArtist(userName);

    // Read audio duration
    const tempAudio = new Audio(objectUrl);
    tempAudio.onloadedmetadata = () => {
      if (tempAudio.duration && !isNaN(tempAudio.duration)) {
        setFileDuration(Math.round(tempAudio.duration));
      }
    };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // URL change & detection with automatic YouTube metadata fetching
  const handleUrlChange = async (val: string) => {
    setLinkUrl(val);
    const trimmed = val.trim();
    const ytId = getYouTubeVideoId(trimmed);

    if (ytId) {
      setLinkPlatform('youtube');
      setIsLoadingInfo(true);
      if (!linkTitle) {
        setLinkTitle('Loading video title...');
        setLinkArtist('YouTube');
      }
      try {
        const info = await fetchYouTubeVideoInfo(ytId);
        if (info) {
          setLinkTitle(info.title);
          setLinkArtist(info.author);
        } else {
          setLinkTitle(`YouTube Video (${ytId})`);
        }
      } catch {
        setLinkTitle(`YouTube Video (${ytId})`);
      } finally {
        setIsLoadingInfo(false);
      }
    } else if (trimmed.toLowerCase().includes('soundcloud.com')) {
      setLinkPlatform('soundcloud');
      if (!linkTitle) {
        setLinkTitle('SoundCloud Stream');
        setLinkArtist('SoundCloud Artist');
      }
    } else if (trimmed.toLowerCase().match(/\.(mp3|wav|ogg|m4a)$/i) || trimmed.toLowerCase().includes('stream')) {
      setLinkPlatform('stream');
      if (!linkTitle) {
        setLinkTitle('Web Audio Stream');
        setLinkArtist('Live Broadcast');
      }
    } else {
      setLinkPlatform('other');
    }
  };

  const formatSeconds = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Submit device track
  const handleSubmitDevice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAddMusic) {
      alert('Adding music is currently restricted to room Admins.');
      return;
    }
    if (!selectedFile) return;

    onAddTrack({
      title: fileTitle.trim() || selectedFile.name,
      artist: fileArtist.trim() || userName,
      duration: formatSeconds(fileDuration),
      durationSeconds: fileDuration,
      sourceType: 'device',
      url: fileUrl || undefined,
      file: selectedFile,
    });

    handleClose();
  };

  // Submit link track
  const handleSubmitLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAddMusic) {
      alert('Adding music is currently restricted to room Admins.');
      return;
    }
    if (!linkUrl.trim()) return;

    let detectedPlatform: 'youtube' | 'soundcloud' | 'stream' = 'stream';
    if (linkPlatform === 'youtube') detectedPlatform = 'youtube';
    else if (linkPlatform === 'soundcloud') detectedPlatform = 'soundcloud';

    onAddTrack({
      title: linkTitle.trim() || 'Shared Web Stream',
      artist: linkArtist.trim() || (detectedPlatform === 'youtube' ? 'YouTube' : 'Web Stream'),
      duration: '03:45',
      durationSeconds: 225,
      sourceType: detectedPlatform,
      url: linkUrl.trim(),
    });

    handleClose();
  };

  const handleClose = () => {
    setSelectedFile(null);
    setFileUrl(null);
    setFileTitle('');
    setFileArtist('');
    setLinkUrl('');
    setLinkTitle('');
    setLinkArtist('');
    onClose();
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl p-5 sm:p-6 shadow-2xl relative text-neutral-200">
        {/* Close button */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-300 p-1 rounded transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Music className="w-3.5 h-3.5" />
          </div>
          <h3 className="text-sm font-semibold text-white tracking-tight">
            Upload Music
          </h3>
        </div>
        <p className="text-xs text-neutral-400 mb-3">
          Stream direct from your local files or add via YouTube/web link.
        </p>

        {/* Lock Banner if permissions restricted to admins */}
        {!canAddMusic && (
          <div className="mb-4 px-3.5 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs flex items-center gap-2 animate-in fade-in">
            <Lock className="w-4 h-4 shrink-0 text-amber-400" />
            <div>
              <span className="font-semibold block">Adding music is locked</span>
              <span className="text-[11px] text-amber-400/80">Only room Admins are permitted to add music right now.</span>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="grid grid-cols-2 p-1 bg-neutral-950 border border-neutral-800 rounded-xl text-xs mb-4">
          <button
            type="button"
            onClick={() => setActiveTab('device')}
            className={`py-2 px-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer text-[11px] sm:text-xs ${
              activeTab === 'device'
                ? 'bg-neutral-800 text-white shadow-xs'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Device Upload</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('link')}
            className={`py-2 px-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer text-[11px] sm:text-xs ${
              activeTab === 'link'
                ? 'bg-neutral-800 text-white shadow-xs'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">YouTube / Web</span>
          </button>
        </div>

        {/* TAB 1: DIRECT DEVICE UPLOAD */}
        {activeTab === 'device' && (
          <form onSubmit={handleSubmitDevice} className="space-y-3.5 text-xs">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac"
              onChange={handleFileChange}
              className="hidden"
            />

            {!selectedFile ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-emerald-500 bg-emerald-500/5'
                    : 'border-neutral-750 hover:border-neutral-600 bg-neutral-950/40'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 mb-2">
                  <Upload className="w-5 h-5 text-neutral-300" />
                </div>
                <div className="font-medium text-white text-xs mb-0.5">
                  Click to browse or drag & drop audio
                </div>
                <div className="text-[11px] text-neutral-500 font-mono">
                  MP3, WAV, FLAC, M4A, OGG
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* File Selected Badge */}
                <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2.5 truncate">
                    <FileAudio className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div className="truncate">
                      <div className="font-medium text-white truncate text-xs">
                        {selectedFile.name}
                      </div>
                      <div className="text-[10px] text-neutral-500 font-mono">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · {formatSeconds(fileDuration)}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setFileUrl(null);
                    }}
                    className="text-neutral-500 hover:text-neutral-300 p-1 text-xs"
                  >
                    Change
                  </button>
                </div>

                {/* Track details */}
                <div>
                  <label className="block text-neutral-300 mb-1">Track title</label>
                  <input
                    type="text"
                    required
                    value={fileTitle}
                    onChange={(e) => setFileTitle(e.target.value)}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1.5 text-white outline-none focus:border-white"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 mb-1">Artist / Resident</label>
                  <input
                    type="text"
                    value={fileArtist}
                    onChange={(e) => setFileArtist(e.target.value)}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1.5 text-white outline-none focus:border-white"
                  />
                </div>

                {/* Local Audio Preview */}
                {fileUrl && (
                  <div className="pt-1">
                    <div className="text-[10px] font-mono text-neutral-500 uppercase mb-1">
                      Local Preview
                    </div>
                    <audio
                      src={fileUrl}
                      controls
                      className="w-full h-8 rounded accent-emerald-500"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={handleClose}
                className="w-full sm:w-auto px-4 py-2.5 min-h-[40px] bg-neutral-800 hover:bg-neutral-750 text-neutral-300 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!selectedFile || !canAddMusic}
                className={`w-full sm:w-auto px-5 py-2.5 min-h-[40px] font-medium rounded-lg transition-colors flex items-center justify-center ${
                  !selectedFile || !canAddMusic
                    ? 'bg-neutral-800 text-neutral-500 opacity-50 cursor-not-allowed'
                    : 'bg-white text-black hover:bg-neutral-200 cursor-pointer shadow-sm'
                }`}
              >
                {!canAddMusic ? 'Upload Locked' : 'Add to Room Queue'}
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: YOUTUBE / WEB LINK */}
        {activeTab === 'link' && (
          <form onSubmit={handleSubmitLink} className="space-y-3.5 text-xs">
            <div>
              <label className="block text-neutral-300 mb-1">
                Audio or Video Link
              </label>
              <div className="relative">
                <input
                  type="url"
                  required
                  placeholder="https://www.youtube.com/watch?v=... or soundcloud.com/..."
                  value={linkUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  autoFocus
                  disabled={!canAddMusic}
                  className={`w-full bg-neutral-800 border rounded-md px-3 py-2 text-white outline-none placeholder:text-neutral-500 text-xs ${
                    !canAddMusic ? 'border-neutral-800 opacity-60 cursor-not-allowed' : 'border-neutral-700 focus:border-white'
                  }`}
                />
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-[11px] text-neutral-500">
                <span className="inline-flex items-center gap-1">
                  <Globe className="w-3 h-3 text-cyan-400" />
                  <span>Detected platform:</span>
                </span>
                <span className="font-medium text-white uppercase font-mono text-[10px] px-1.5 py-0.2 rounded bg-neutral-800 flex items-center gap-1">
                  {linkPlatform}
                  {isLoadingInfo && <Loader2 className="w-2.5 h-2.5 animate-spin text-neutral-400" />}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-neutral-300 mb-1">Track title</label>
              <input
                type="text"
                required
                placeholder="e.g. Synthwave Study Session"
                value={linkTitle}
                disabled={!canAddMusic}
                onChange={(e) => setLinkTitle(e.target.value)}
                className={`w-full bg-neutral-800 border rounded-md px-2.5 py-1.5 text-white outline-none ${
                  !canAddMusic ? 'border-neutral-800 opacity-60 cursor-not-allowed' : 'border-neutral-700 focus:border-white'
                }`}
              />
            </div>

            <div>
              <label className="block text-neutral-300 mb-1">Artist / Channel</label>
              <input
                type="text"
                placeholder="e.g. Lofi Girl / YouTube"
                value={linkArtist}
                disabled={!canAddMusic}
                onChange={(e) => setLinkArtist(e.target.value)}
                className={`w-full bg-neutral-800 border rounded-md px-2.5 py-1.5 text-white outline-none ${
                  !canAddMusic ? 'border-neutral-800 opacity-60 cursor-not-allowed' : 'border-neutral-700 focus:border-white'
                }`}
              />
            </div>


            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={handleClose}
                className="w-full sm:w-auto px-4 py-2.5 min-h-[40px] bg-neutral-800 hover:bg-neutral-750 text-neutral-300 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!linkUrl.trim() || !canAddMusic}
                className={`w-full sm:w-auto px-5 py-2.5 min-h-[40px] font-medium rounded-lg transition-colors flex items-center justify-center ${
                  !linkUrl.trim() || !canAddMusic
                    ? 'bg-neutral-800 text-neutral-500 opacity-50 cursor-not-allowed'
                    : 'bg-white text-black hover:bg-neutral-200 cursor-pointer shadow-sm'
                }`}
              >
                {!canAddMusic ? 'Upload Locked' : 'Add Link to Queue'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
