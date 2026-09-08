// Helper functions to parse YouTube URLs, extract video IDs, and fetch metadata

export function getYouTubeVideoId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // If directly passed an 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // Regex covering:
  // - youtube.com/watch?v=...
  // - youtu.be/...
  // - youtube.com/embed/...
  // - youtube.com/shorts/...
  // - youtube.com/live/...
  // - youtube.com/v/...
  // - music.youtube.com/watch?v=...
  const regExp = /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = trimmed.match(regExp);
  if (match && match[1]) {
    return match[1];
  }

  // Fallback looser match
  const fallback = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const fallbackMatch = trimmed.match(fallback);
  if (fallbackMatch && fallbackMatch[2] && fallbackMatch[2].length === 11) {
    return fallbackMatch[2];
  }

  return null;
}

export function isYouTubeUrl(url: string): boolean {
  if (!url) return false;
  return getYouTubeVideoId(url) !== null;
}

export function isSoundCloudUrl(url: string): boolean {
  if (!url) return false;
  return /^(https?:\/\/)?(www\.)?soundcloud\.com\/.+/.test(url);
}

// Fetch real title and author from YouTube's public oEmbed API
export async function fetchYouTubeVideoInfo(videoIdOrUrl: string): Promise<{ title: string; author: string } | null> {
  const videoId = getYouTubeVideoId(videoIdOrUrl);
  if (!videoId) return null;

  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: data.title || 'YouTube Video',
      author: data.author_name || 'YouTube Creator',
    };
  } catch {
    return null;
  }
}
