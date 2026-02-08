import { useState, useRef, useMemo } from 'react';
import { X, Plus, Video, Music, Upload, Loader2, MapPin, ArrowUp, ArrowDown, Link2, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { useTimeline } from '@/context/TimelineContext';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface AnecdoteFormProps {
  year: number;
  onClose: () => void;
}

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.m4v'];
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];

export function AnecdoteForm({ year, onClose }: AnecdoteFormProps) {
  const { addAnecdote } = useTimeline();
  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [storyteller, setStoryteller] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(`${year}-01-01`);
  const [tags, setTags] = useState('');
  const [mediaUrls, setMediaUrls] = useState<{ url: string; type: 'image' | 'video' | 'audio'; caption: string; filename?: string }[]>([]);
  const [newMediaUrl, setNewMediaUrl] = useState('');
  const [newMediaType, setNewMediaType] = useState<'image' | 'video' | 'audio'>('image');
  const [newMediaCaption, setNewMediaCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !story.trim() || !storyteller.trim()) return;

    addAnecdote({
      date,
      year,
      title: title.trim(),
      story: story.trim(),
      storyteller: storyteller.trim(),
      location: location.trim(),
      notes: notes.trim(),
      media: mediaUrls.map(m => ({
        id: '',
        type: m.type,
        url: m.url,
        caption: m.caption
      })),
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
    });

    onClose();
  };

  const addMedia = () => {
    if (!newMediaUrl.trim()) return;
    setMediaUrls(prev => [...prev, { 
      url: newMediaUrl.trim(), 
      type: newMediaType,
      caption: newMediaCaption.trim()
    }]);
    setNewMediaUrl('');
    setNewMediaCaption('');
  };

  const removeMedia = async (index: number) => {
    const media = mediaUrls[index];
    // If it's an uploaded file, delete it from server
    if (media.filename) {
      try {
        await api.deleteImage(media.filename);
      } catch (error) {
        console.error('Error deleting image:', error);
      }
    }
    setMediaUrls(mediaUrls.filter((_, i) => i !== index));
  };

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;

    setIsUploading(true);
    setUploadProgress(`Uploading ${files.length} image${files.length > 1 ? 's' : ''}...`);

    try {
      const uploadPromises = files.map(async (file) => {
        const result = await api.uploadImage(file);
        return {
          url: result.url,
          type: 'image' as const,
          caption: '',
          filename: result.filename,
        };
      });

      const uploadedMedia = await Promise.all(uploadPromises);
      setMediaUrls(prev => [...prev, ...uploadedMedia]);
      setUploadProgress('');
    } catch (error) {
      console.error('Error uploading images:', error);
      setUploadProgress('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await uploadFiles(Array.from(files));
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    if (files.length === 0) return;
    await uploadFiles(files);
  };

  const updateMediaCaption = (index: number, caption: string) => {
    setMediaUrls(mediaUrls.map((m, i) => i === index ? { ...m, caption } : m));
  };

  const getVideoEmbedUrl = (url: string): string | null => {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

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

  const moveMedia = (index: number, direction: 'up' | 'down') => {
    setMediaUrls(prev => {
      const next = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  };

  const mediaCounts = useMemo(() => {
    return mediaUrls.reduce(
      (acc, item) => {
        acc[item.type] += 1;
        return acc;
      },
      { image: 0, video: 0, audio: 0 }
    );
  }, [mediaUrls]);

  return (
    <div className="glass rounded-2xl p-6 md:p-8 max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-display text-2xl text-white">
          Add Story from {year}
        </h3>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-full transition-colors"
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Date */}
        <div>
          <Label htmlFor="date" className="text-gray-300">Date</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-gray-800/50 border-gray-700 text-white mt-1"
            required
          />
        </div>

        {/* Title */}
        <div>
          <Label htmlFor="title" className="text-gray-300">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What happened?"
            className="bg-gray-800/50 border-gray-700 text-white mt-1"
            required
          />
        </div>

        {/* Story */}
        <div>
          <Label htmlFor="story" className="text-gray-300">Your Story</Label>
          <Textarea
            id="story"
            value={story}
            onChange={(e) => setStory(e.target.value)}
            placeholder="Tell us what happened..."
            className="bg-gray-800/50 border-gray-700 text-white mt-1 min-h-[120px]"
            required
          />
        </div>

        {/* Location */}
        <div>
          <Label htmlFor="location" className="text-gray-300 flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Location
          </Label>
          <Input
            id="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Where did this happen? (e.g., Showbox, Gas Works Park)"
            className="bg-gray-800/50 border-gray-700 text-white mt-1"
          />
        </div>

        {/* Storyteller */}
        <div>
          <Label htmlFor="storyteller" className="text-gray-300">Your Name</Label>
          <Input
            id="storyteller"
            value={storyteller}
            onChange={(e) => setStoryteller(e.target.value)}
            placeholder="Who are you?"
            className="bg-gray-800/50 border-gray-700 text-white mt-1"
            required
          />
        </div>

        {/* Notes */}
        <div>
          <Label htmlFor="notes" className="text-gray-300">Additional Notes</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional context or details..."
            className="bg-gray-800/50 border-gray-700 text-white mt-1"
          />
        </div>

        {/* Tags */}
        <div>
          <Label htmlFor="tags" className="text-gray-300">Tags (comma separated)</Label>
          <Input
            id="tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="e.g., concert, wizkid, dance"
            className="bg-gray-800/50 border-gray-700 text-white mt-1"
          />
        </div>

        {/* Media */}
        <div>
          <Label className="text-gray-300">Media</Label>

          <div
            className={`mt-2 rounded-xl border-2 border-dashed p-4 transition-colors ${isDragActive ? 'border-[#D0FF59] bg-[#D0FF59]/5' : 'border-gray-700 bg-gray-900/40'}`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragActive(true);
            }}
            onDragLeave={() => setIsDragActive(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="text-sm text-gray-300">Drag and drop images here</p>
                <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB each</p>
              </div>
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                variant="outline"
                className="border-dashed border-2 border-gray-600 text-gray-300 hover:border-[#D0FF59] hover:text-[#D0FF59] py-3"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    {uploadProgress}
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 mr-2" />
                    Upload Images
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-3">
            <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3" />{mediaCounts.image} images</span>
            <span className="flex items-center gap-1"><Video className="w-3 h-3" />{mediaCounts.video} videos</span>
            <span className="flex items-center gap-1"><Music className="w-3 h-3" />{mediaCounts.audio} audio</span>
          </div>

          {/* Or Add Media by URL */}
          <div className="mt-4 pt-4 border-t border-gray-700">
            <p className="text-gray-500 text-sm mb-2">Or add media by URL:</p>
            <div className="grid md:grid-cols-[160px_1fr_44px] gap-2">
              <select
                value={newMediaType}
                onChange={(e) => setNewMediaType(e.target.value as 'image' | 'video' | 'audio')}
                className="bg-gray-800/50 border border-gray-700 text-white rounded-md px-3 py-2"
              >
                <option value="image">Image URL</option>
                <option value="video">Video URL</option>
                <option value="audio">Audio URL</option>
              </select>
              <Input
                value={newMediaUrl}
                onChange={(e) => setNewMediaUrl(e.target.value)}
                placeholder="https://..."
                className="bg-gray-800/50 border-gray-700 text-white"
              />
              <Button
                type="button"
                onClick={addMedia}
                variant="outline"
                className="border-[#D0FF59] text-[#D0FF59] hover:bg-[#D0FF59] hover:text-black"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <Input
              value={newMediaCaption}
              onChange={(e) => setNewMediaCaption(e.target.value)}
              placeholder="Add a caption (optional)"
              className="bg-gray-800/50 border-gray-700 text-white mt-2"
            />
          </div>

          {/* Media List */}
          {mediaUrls.length > 0 && (
            <div className="mt-4 space-y-3">
              {mediaUrls.map((media, index) => (
                <div
                  key={index}
                  className="flex flex-col md:flex-row md:items-center gap-3 p-3 bg-gray-800/50 rounded-lg"
                >
                  <div className="w-24 h-20 flex-shrink-0 bg-gray-900 rounded-lg overflow-hidden border border-gray-700 flex items-center justify-center">
                    {media.type === 'image' && (
                      <img
                        src={media.url.startsWith('/uploads/') ? api.getUploadsUrl(media.url) : media.url}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    )}
                    {media.type === 'video' && (() => {
                      const previewUrl = media.url.startsWith('/uploads/') ? api.getUploadsUrl(media.url) : media.url;
                      const embedUrl = getVideoEmbedUrl(previewUrl);
                      if (embedUrl) {
                        return (
                          <iframe
                            src={embedUrl}
                            title="Video preview"
                            className="w-full h-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        );
                      }
                      if (!isDirectMediaFile(previewUrl, VIDEO_EXTENSIONS)) {
                        return (
                          <a
                            href={previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[#D0FF59] inline-flex items-center gap-1 px-2 text-center"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Open video
                          </a>
                        );
                      }
                      return (
                        <video
                          src={previewUrl}
                          controls
                          preload="metadata"
                          className="w-full h-full object-cover"
                        />
                      );
                    })()}
                    {media.type === 'audio' && (
                      (() => {
                        const previewUrl = media.url.startsWith('/uploads/') ? api.getUploadsUrl(media.url) : media.url;
                        if (!isDirectMediaFile(previewUrl, AUDIO_EXTENSIONS)) {
                          return (
                            <a
                              href={previewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-[#D0FF59] inline-flex items-center gap-1 px-2 text-center"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Open audio
                            </a>
                          );
                        }
                        return (
                          <audio
                            src={previewUrl}
                            controls
                            className="w-full"
                          />
                        );
                      })()
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-gray-500 mb-1">
                      <span>{media.type}</span>
                      {media.filename && <span>uploaded</span>}
                    </div>
                    <p className="text-white text-sm truncate flex items-center gap-2">
                      <Link2 className="w-3 h-3 text-gray-500" />
                      {media.url}
                    </p>
                    <Input
                      value={media.caption}
                      onChange={(e) => updateMediaCaption(index, e.target.value)}
                      placeholder="Add a caption..."
                      className="bg-gray-700/50 border-gray-600 text-white text-xs mt-2"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => moveMedia(index, 'up')}
                      className="p-2 hover:bg-white/10 rounded transition-colors"
                      disabled={index === 0}
                    >
                      <ArrowUp className="w-4 h-4 text-gray-400" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveMedia(index, 'down')}
                      className="p-2 hover:bg-white/10 rounded transition-colors"
                      disabled={index === mediaUrls.length - 1}
                    >
                      <ArrowDown className="w-4 h-4 text-gray-400" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeMedia(index)}
                      className="p-2 hover:bg-white/10 rounded transition-colors"
                    >
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex gap-4 pt-4">
          <Button
            type="button"
            onClick={onClose}
            variant="outline"
            className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isUploading}
            className="flex-1 bg-[#D0FF59] text-black hover:bg-[#b8e04d]"
          >
            Add Story
          </Button>
        </div>
      </form>
    </div>
  );
}
