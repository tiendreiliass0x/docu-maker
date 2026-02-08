import { useState } from 'react';
import { X, Calendar, User, Tag, Edit2, Trash2, Save, Video, Music, ExternalLink, MapPin } from 'lucide-react';
import { useTimeline } from '@/context/TimelineContext';
import { useAuth } from '@/context/AuthContext';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Anecdote, Media } from '@/types';

interface AnecdoteCardProps {
  anecdote: Anecdote;
  expanded?: boolean;
  onClose?: () => void;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const UPLOADS_URL = API_BASE_URL.replace('/api', '');
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.m4v'];
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];

export function AnecdoteCard({ anecdote, expanded = false, onClose }: AnecdoteCardProps) {
  const { updateAnecdote, deleteAnecdote, setExpandedAnecdote } = useTimeline();
  const { isAuthenticated } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editedAnecdote, setEditedAnecdote] = useState(anecdote);

  const handleSave = () => {
    updateAnecdote(anecdote.id, editedAnecdote);
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this story?')) {
      deleteAnecdote(anecdote.id);
      if (onClose) onClose();
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getMediaUrl = (url: string) => {
    if (url.startsWith('/uploads/')) {
      return `${UPLOADS_URL}${url}`;
    }
    return url;
  };

  // Filter image media
  const imageMedia = anecdote.media.filter(m => m.type === 'image');
  const otherMedia = anecdote.media.filter(m => m.type !== 'image');
  const primaryMedia = imageMedia[0] || otherMedia[0];

  if (!expanded) {
    return (
      <div 
        className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 border border-gray-700 hover:border-[#D0FF59]/50 transition-all cursor-pointer"
        onClick={() => setExpandedAnecdote(anecdote)}
      >
        {primaryMedia && (
          <div className="mb-3 rounded-lg overflow-hidden border border-gray-700 bg-gray-900">
            {primaryMedia.type === 'image' && (
              <img
                src={getMediaUrl(primaryMedia.url)}
                alt={primaryMedia.caption || anecdote.title}
                className="w-full h-32 object-cover"
              />
            )}
            {primaryMedia.type === 'video' && (() => {
              const mediaUrl = getMediaUrl(primaryMedia.url);
              const embedUrl = getVideoEmbedUrl(mediaUrl);
              if (embedUrl) {
                return (
                  <div className="aspect-video">
                    <iframe
                      src={embedUrl}
                      title={primaryMedia.caption || 'Video preview'}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                );
              }
              if (!isDirectMediaFile(mediaUrl, VIDEO_EXTENSIONS)) {
                return (
                  <div className="h-32 flex items-center justify-center text-gray-400 text-xs px-3 text-center">
                    Open full card to view this video source
                  </div>
                );
              }
              return (
                <video
                  src={mediaUrl}
                  controls
                  preload="metadata"
                  className="w-full h-32 object-cover"
                />
              );
            })()}
            {primaryMedia.type === 'audio' && (
              <div className="p-3">
                <audio
                  src={getMediaUrl(primaryMedia.url)}
                  controls
                  preload="metadata"
                  className="w-full"
                />
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 text-[#D0FF59] text-xs mb-2">
          <Calendar className="w-3 h-3" />
          {formatDate(anecdote.date)}
        </div>
        <h4 className="text-white font-semibold text-sm mb-2 line-clamp-2">
          {anecdote.title}
        </h4>
        <p className="text-gray-400 text-xs line-clamp-3">
          {anecdote.story}
        </p>
        {anecdote.location && (
          <div className="flex items-center gap-1 text-gray-500 text-xs mt-2">
            <MapPin className="w-3 h-3" />
            <span className="truncate">{anecdote.location}</span>
          </div>
        )}
        {/* Media Thumbnails at bottom */}
        {anecdote.media.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-700">
            <div className="flex items-center gap-2">
              {/* Show first image thumbnail */}
              {imageMedia.length > 0 && (
                <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                  <img 
                    src={getMediaUrl(imageMedia[0].url)} 
                    alt="" 
                    className="w-full h-full object-cover"
                  />
                  {anecdote.media.length > 1 && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <span className="text-white text-xs font-medium">+{anecdote.media.length - 1}</span>
                    </div>
                  )}
                </div>
              )}
              
              {/* Show media info */}
              <div className="flex-1 min-w-0">
                <p className="text-gray-400 text-xs">
                  {anecdote.media.length} media item{anecdote.media.length !== 1 ? 's' : ''}
                </p>
                <div className="flex gap-1 mt-1">
                  {imageMedia.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded">
                      {imageMedia.length} photo{imageMedia.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {otherMedia.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded">
                      {otherMedia.length} video/audio
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-gray-900 to-black rounded-2xl border border-gray-700 overflow-hidden max-w-5xl w-full">
      <div className="max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-800">
          {isEditing ? (
            <Input
              value={editedAnecdote.title}
              onChange={(e) => setEditedAnecdote({ ...editedAnecdote, title: e.target.value })}
              className="bg-gray-800/50 border-gray-700 text-white text-xl font-semibold flex-1 mr-4"
            />
          ) : (
            <h2 className="font-display text-2xl md:text-3xl text-white">
              {anecdote.title}
            </h2>
          )}
          
          <div className="flex items-center gap-2">
            {/* Edit/Delete buttons - only visible when authenticated */}
            {isAuthenticated && (
              <>
                {!isEditing ? (
                  <>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="p-2 hover:bg-white/10 rounded-full transition-colors"
                      title="Edit story"
                    >
                      <Edit2 className="w-5 h-5 text-gray-400" />
                    </button>
                    <button
                      onClick={handleDelete}
                      className="p-2 hover:bg-red-500/20 rounded-full transition-colors"
                      title="Delete story"
                    >
                      <Trash2 className="w-5 h-5 text-red-400" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleSave}
                    className="p-2 hover:bg-[#D0FF59]/20 rounded-full transition-colors"
                    title="Save changes"
                  >
                    <Save className="w-5 h-5 text-[#D0FF59]" />
                  </button>
                )}
              </>
            )}
            
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            )}
          </div>
        </div>

        {/* Media Gallery at the top */}
        {imageMedia.length > 0 && (
          <div className="p-6 pb-2 border-b border-gray-800">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {imageMedia.map((media, index) => (
                <div key={index} className="group relative">
                  <a 
                    href={getMediaUrl(media.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <div className="aspect-video bg-gray-800 rounded-lg overflow-hidden">
                      <img 
                        src={getMediaUrl(media.url)}
                        alt={media.caption || `Image ${index + 1}`}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                  </a>
                  {media.caption && (
                    <p className="text-gray-400 text-xs mt-1 truncate">{media.caption}</p>
                  )}
                  <a 
                    href={getMediaUrl(media.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute top-2 right-2 p-2 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ExternalLink className="w-4 h-4 text-white" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Meta Info */}
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-[#D0FF59]">
              <Calendar className="w-4 h-4" />
              {isEditing ? (
                <Input
                  type="date"
                  value={editedAnecdote.date}
                  onChange={(e) => setEditedAnecdote({ ...editedAnecdote, date: e.target.value })}
                  className="bg-gray-800/50 border-gray-700 text-white w-auto"
                />
              ) : (
                formatDate(anecdote.date)
              )}
            </div>
            
            {/* Location */}
            <div className="flex items-center gap-2 text-gray-400">
              <MapPin className="w-4 h-4" />
              {isEditing ? (
                <Input
                  value={editedAnecdote.location}
                  onChange={(e) => setEditedAnecdote({ ...editedAnecdote, location: e.target.value })}
                  className="bg-gray-800/50 border-gray-700 text-white w-auto"
                  placeholder="Location"
                />
              ) : (
                anecdote.location || 'Unknown location'
              )}
            </div>

            <div className="flex items-center gap-2 text-gray-400">
              <User className="w-4 h-4" />
              {isEditing ? (
                <Input
                  value={editedAnecdote.storyteller}
                  onChange={(e) => setEditedAnecdote({ ...editedAnecdote, storyteller: e.target.value })}
                  className="bg-gray-800/50 border-gray-700 text-white w-auto"
                />
              ) : (
                anecdote.storyteller
              )}
            </div>
          </div>

          {/* Story */}
          <div>
            <h3 className="text-gray-500 text-sm mb-2 uppercase tracking-wider">The Story</h3>
            {isEditing ? (
              <Textarea
                value={editedAnecdote.story}
                onChange={(e) => setEditedAnecdote({ ...editedAnecdote, story: e.target.value })}
                className="bg-gray-800/50 border-gray-700 text-white min-h-[150px]"
              />
            ) : (
              <p className="text-white text-lg leading-relaxed whitespace-pre-wrap">
                {anecdote.story}
              </p>
            )}
          </div>

          {/* Notes */}
          {((!isEditing && anecdote.notes) || isEditing) && (
            <div>
              <h3 className="text-gray-500 text-sm mb-2 uppercase tracking-wider">Notes</h3>
              {isEditing ? (
                <Textarea
                  value={editedAnecdote.notes}
                  onChange={(e) => setEditedAnecdote({ ...editedAnecdote, notes: e.target.value })}
                  className="bg-gray-800/50 border-gray-700 text-white"
                  placeholder="Additional notes..."
                />
              ) : (
                <p className="text-gray-400 italic">
                  {anecdote.notes}
                </p>
              )}
            </div>
          )}

          {/* Tags */}
          <div>
            <h3 className="text-gray-500 text-sm mb-2 uppercase tracking-wider">Tags</h3>
            {isEditing ? (
              <Input
                value={editedAnecdote.tags.join(', ')}
                onChange={(e) => setEditedAnecdote({ 
                  ...editedAnecdote, 
                  tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) 
                })}
                className="bg-gray-800/50 border-gray-700 text-white"
                placeholder="comma, separated, tags"
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                {anecdote.tags.map(tag => (
                  <span 
                    key={tag}
                    className="flex items-center gap-1 px-3 py-1 bg-gray-800 text-[#D0FF59] rounded-full text-sm"
                  >
                    <Tag className="w-3 h-3" />
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Other Media (Video/Audio) */}
          {otherMedia.length > 0 && (
            <div>
              <h3 className="text-gray-500 text-sm mb-4 uppercase tracking-wider">Media</h3>
              <div className="space-y-3">
                {otherMedia.map((media, index) => (
                  <MediaItem key={index} media={media} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const normalizeHost = (host: string) => host.replace(/^www\./, '').toLowerCase();

const getVideoEmbedUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    const host = normalizeHost(parsed.hostname);

    if (host === 'youtu.be' || host.endsWith('youtube.com') || host === 'youtube-nocookie.com') {
      let id = '';
      if (host === 'youtu.be') {
        id = parsed.pathname.split('/').filter(Boolean)[0] || '';
      } else if (parsed.pathname.startsWith('/watch')) {
        id = parsed.searchParams.get('v') || '';
      } else if (parsed.pathname.startsWith('/shorts/') || parsed.pathname.startsWith('/embed/') || parsed.pathname.startsWith('/live/')) {
        id = parsed.pathname.split('/').filter(Boolean)[1] || '';
      }
      if (id) return `https://www.youtube.com/embed/${id}`;
    }

    if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
      const match = parsed.pathname.match(/\/(\d+)/);
      if (match?.[1]) return `https://player.vimeo.com/video/${match[1]}`;
    }
  } catch {
    return null;
  }

  return null;
};

const isDirectMediaFile = (url: string, extensions: string[]): boolean => {
  if (url.startsWith('/uploads/')) return true;
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return extensions.some(ext => pathname.endsWith(ext));
  } catch {
    const lower = url.toLowerCase();
    return extensions.some(ext => lower.includes(ext));
  }
};

function MediaItem({ media }: { media: Media }) {
  const [error, setError] = useState(false);
  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
  const UPLOADS_URL = API_BASE_URL.replace('/api', '');

  const getMediaUrl = (url: string) => {
    if (url.startsWith('/uploads/')) {
      return `${UPLOADS_URL}${url}`;
    }
    return url;
  };

  const resolvedUrl = getMediaUrl(media.url);
  const embedUrl = media.type === 'video' ? getVideoEmbedUrl(resolvedUrl) : null;

  if (embedUrl) {
    return (
      <div className="relative">
        <div className="aspect-video rounded-lg overflow-hidden bg-gray-800">
          <iframe
            src={embedUrl}
            title={media.caption || 'Embedded video'}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        {media.caption && (
          <p className="text-gray-400 text-xs mt-2">{media.caption}</p>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="aspect-video bg-gray-800 rounded-lg flex flex-col items-center justify-center p-4">
        {media.type === 'video' && <Video className="w-8 h-8 text-gray-600 mb-2" />}
        {media.type === 'audio' && <Music className="w-8 h-8 text-gray-600 mb-2" />}
        <p className="text-gray-500 text-xs text-center truncate w-full">{media.url}</p>
        <a
          href={resolvedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-[#D0FF59] hover:underline"
        >
          <ExternalLink className="w-3 h-3" />
          Open source
        </a>
        {media.caption && <p className="text-gray-400 text-xs mt-1">{media.caption}</p>}
      </div>
    );
  }

  if (media.type === 'video') {
    if (!isDirectMediaFile(resolvedUrl, VIDEO_EXTENSIONS)) {
      return (
        <div className="aspect-video bg-gray-800 rounded-lg flex flex-col items-center justify-center p-4">
          <Video className="w-8 h-8 text-gray-600 mb-2" />
          <p className="text-gray-400 text-xs text-center">This URL is not a direct video file. Open source or use YouTube/Vimeo link.</p>
          <a
            href={resolvedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-[#D0FF59] hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            Open source
          </a>
          {media.caption && (
            <p className="text-gray-400 text-xs mt-2">{media.caption}</p>
          )}
        </div>
      );
    }

    return (
      <div className="relative">
        <video 
          src={resolvedUrl}
          controls
          preload="metadata"
          className="w-full aspect-video rounded-lg"
          onError={() => setError(true)}
        />
        {media.caption && (
          <p className="text-gray-400 text-xs mt-1">{media.caption}</p>
        )}
      </div>
    );
  }

  if (media.type === 'audio') {
    if (!isDirectMediaFile(resolvedUrl, AUDIO_EXTENSIONS)) {
      return (
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Music className="w-4 h-4" />
            This URL is not a direct audio file.
          </div>
          <a
            href={resolvedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-[#D0FF59] hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            Open source
          </a>
          {media.caption && (
            <p className="text-gray-400 text-xs mt-2">{media.caption}</p>
          )}
        </div>
      );
    }

    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <audio 
          src={resolvedUrl}
          controls
          preload="metadata"
          className="w-full"
          onError={() => setError(true)}
        />
        {media.caption && (
          <p className="text-gray-400 text-xs mt-2">{media.caption}</p>
        )}
      </div>
    );
  }

  return null;
}
