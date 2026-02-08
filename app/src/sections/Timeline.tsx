import { useState, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Plus, Calendar, User, MapPin, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTimeline } from '@/context/TimelineContext';
import { useAuth } from '@/context/AuthContext';
import { AnecdoteForm } from '@/components/AnecdoteForm';
import { AnecdoteCard } from '@/components/AnecdoteCard';
import type { Anecdote } from '@/types';

gsap.registerPlugin(ScrollTrigger);

// Generate years from 2012 to 2026 (starting at 2012)
const YEARS = Array.from({ length: 15 }, (_, i) => 2012 + i);

// Year item width + gap = 64px + 64px = 128px per year
const YEAR_ITEM_WIDTH = 64;
const YEAR_GAP = 64;
const YEAR_SPACING = YEAR_ITEM_WIDTH + YEAR_GAP;

export function Timeline() {
  const { 
    selectedYear, 
    selectYear, 
    getAnecdotesByYear, 
    expandedAnecdote,
    setExpandedAnecdote 
  } = useTimeline();
  
  const { isAuthenticated } = useAuth();
  
  const [showForm, setShowForm] = useState(false);
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const yearRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Animate timeline points on scroll
      yearRefs.current.forEach((el, year) => {
        gsap.fromTo(el,
          { scale: 0, opacity: 0 },
          {
            scale: 1,
            opacity: 1,
            duration: 0.6,
            ease: 'back.out(1.7)',
            scrollTrigger: {
              trigger: timelineRef.current,
              start: 'top 80%',
              toggleActions: 'play none none reverse'
            },
            delay: (year - 2012) * 0.03
          }
        );
      });
    }, timelineRef);

    return () => ctx.revert();
  }, []);

  const handleYearClick = (year: number) => {
    if (selectedYear === year) {
      selectYear(null);
    } else {
      selectYear(year);
      setShowForm(false);
    }
  };

  const scrollTimeline = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 400;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const yearAnecdotes = selectedYear ? getAnecdotesByYear(selectedYear) : [];

  // Calculate highlight position based on year index
  const getHighlightPosition = (year: number) => {
    const yearIndex = YEARS.indexOf(year);
    if (yearIndex === -1) return 0;
    return (yearIndex * YEAR_SPACING) + (YEAR_ITEM_WIDTH / 2);
  };

  return (
    <section 
      id="timeline"
      ref={timelineRef}
      className="relative min-h-screen py-20 px-4"
    >
      {/* Section Header */}
      <div className="text-center mb-16">
        <h2 className="font-display text-4xl md:text-5xl lg:text-6xl text-white mb-4">
          THE TIMELINE
        </h2>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
          Click on any year to explore stories from that time.
        </p>
      </div>

      {/* Timeline Track with Scroll */}
      <div className="relative max-w-6xl mx-auto">
        {/* Scroll Buttons */}
        <button
          onClick={() => scrollTimeline('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2 bg-gray-800/80 hover:bg-gray-700 rounded-full transition-colors"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        <button
          onClick={() => scrollTimeline('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-2 bg-gray-800/80 hover:bg-gray-700 rounded-full transition-colors"
        >
          <ChevronRight className="w-6 h-6 text-white" />
        </button>

        {/* Scrollable Container */}
        <div 
          ref={scrollContainerRef}
          className="overflow-x-auto scrollbar-hide px-12 py-8"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <div ref={trackRef} className="relative min-w-max">
            {/* Timeline Line - full width */}
            <div 
              className="absolute top-1/2 h-1 bg-gradient-to-r from-gray-800 via-gray-600 to-gray-800 -translate-y-1/2 rounded-full"
              style={{
                left: `${YEAR_ITEM_WIDTH / 2}px`,
                width: `${(YEARS.length - 1) * YEAR_SPACING}px`
              }}
            />
            
            {/* Active Highlight - centered on selected year */}
            {selectedYear && (
              <div 
                className="absolute top-1/2 h-2 bg-[#D0FF59] -translate-y-1/2 transition-all duration-500 rounded-full z-10"
                style={{
                  left: `${getHighlightPosition(selectedYear)}px`,
                  width: '24px',
                  transform: 'translate(-50%, -50%)',
                  boxShadow: '0 0 20px rgba(208, 255, 89, 0.8), 0 0 40px rgba(208, 255, 89, 0.4)'
                }}
              />
            )}

            {/* Year Points */}
            <div className="relative flex items-center py-12">
              {YEARS.map((year) => {
                const hasAnecdotes = getAnecdotesByYear(year).length > 0;
                const isSelected = selectedYear === year;
                const isHovered = hoveredYear === year;

                return (
                  <div 
                    key={year} 
                    className="relative flex flex-col items-center flex-shrink-0"
                    style={{ 
                      width: `${YEAR_ITEM_WIDTH}px`,
                      marginRight: `${YEAR_GAP}px`
                    }}
                  >
                    {/* Year Label (above) */}
                    <span 
                      className={`absolute -top-10 text-sm font-medium transition-all duration-300 whitespace-nowrap ${
                        isSelected || isHovered ? 'text-[#D0FF59] scale-110' : 'text-gray-500'
                      }`}
                    >
                      {year}
                    </span>

                    {/* Point */}
                    <button
                      ref={el => {
                        if (el) yearRefs.current.set(year, el);
                      }}
                      onClick={() => handleYearClick(year)}
                      onMouseEnter={() => setHoveredYear(year)}
                      onMouseLeave={() => setHoveredYear(null)}
                      className={`relative w-5 h-5 rounded-full transition-all duration-300 timeline-point flex-shrink-0 z-20 ${
                        isSelected 
                          ? 'bg-[#D0FF59] scale-150' 
                          : hasAnecdotes 
                            ? 'bg-white hover:bg-[#D0FF59] hover:scale-125' 
                            : 'bg-gray-600 hover:bg-gray-400 hover:scale-110'
                      }`}
                      style={{
                        boxShadow: isSelected ? '0 0 30px rgba(208, 255, 255, 0.6)' : 'none'
                      }}
                    >
                      {/* Ripple effect for selected */}
                      {isSelected && (
                        <span className="absolute inset-0 rounded-full bg-[#D0FF59] animate-ping opacity-30" />
                      )}

                      {/* Anecdote count badge */}
                      {hasAnecdotes && (
                        <span className="absolute -top-2 -right-2 w-5 h-5 bg-[#D0FF59] text-black text-xs font-bold rounded-full flex items-center justify-center">
                          {getAnecdotesByYear(year).length}
                        </span>
                      )}
                    </button>

                    {/* Year Label (below) */}
                    <span 
                      className={`absolute -bottom-10 text-xs transition-all duration-300 whitespace-nowrap ${
                        isSelected || isHovered ? 'text-white' : 'text-gray-600'
                      }`}
                    >
                      {year}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Selected Year Content */}
      {selectedYear && (
        <div className="mt-20 max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="font-display text-3xl text-white mb-2">
                {selectedYear}
              </h3>
              <p className="text-gray-400">
                {yearAnecdotes.length} {yearAnecdotes.length === 1 ? 'story' : 'stories'} from this year
              </p>
            </div>
            
            {/* Add Story Button - only visible when authenticated */}
            {isAuthenticated && (
              <button
                onClick={() => setShowForm(!showForm)}
                className="flex items-center gap-2 px-6 py-3 bg-[#D0FF59] text-black font-semibold rounded-full hover:scale-105 transition-transform duration-300"
              >
                <Plus className="w-5 h-5" />
                Add Your Story
              </button>
            )}
          </div>

          {/* Add Anecdote Form */}
          {showForm && isAuthenticated && (
            <div className="mb-8 animate-[fadeIn_0.3s_ease]">
              <AnecdoteForm 
                year={selectedYear} 
                onClose={() => setShowForm(false)} 
              />
            </div>
          )}

          {/* Anecdotes Grid with Dock Effect */}
          {yearAnecdotes.length > 0 ? (
            <div className="dock-strip flex flex-wrap justify-center gap-4 py-8">
              {yearAnecdotes.map((anecdote) => (
                <DockAnecdoteCard 
                  key={anecdote.id} 
                  anecdote={anecdote} 
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 glass rounded-2xl">
              <Calendar className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 text-lg">
                No stories from {selectedYear} yet.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Expanded Anecdote Modal */}
      {expandedAnecdote && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setExpandedAnecdote(null)}
        >
          <div 
            className="w-full max-w-5xl max-h-[90vh] overflow-auto"
            onClick={e => e.stopPropagation()}
          >
            <AnecdoteCard 
              anecdote={expandedAnecdote} 
              expanded 
              onClose={() => setExpandedAnecdote(null)}
            />
          </div>
        </div>
      )}
    </section>
  );
}

// Dock-style anecdote card with hover scaling
function DockAnecdoteCard({ anecdote }: { anecdote: Anecdote }) {
  const { setExpandedAnecdote } = useTimeline();

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
  const UPLOADS_URL = API_BASE_URL.replace('/api', '');

  const getImageUrl = (url: string) => {
    if (url.startsWith('/uploads/')) {
      return `${UPLOADS_URL}${url}`;
    }
    return url;
  };

  const imageMedia = anecdote.media.filter(m => m.type === 'image');
  const otherMedia = anecdote.media.filter(m => m.type !== 'image');

  return (
    <div
      className="dock-item cursor-pointer"
      onClick={() => setExpandedAnecdote(anecdote)}
    >
      <div className="w-48 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 border border-gray-700 hover:border-[#D0FF59]/50 transition-colors">
        {imageMedia.length > 0 && (
          <div className="mb-3 rounded-lg overflow-hidden border border-gray-700">
            <img
              src={getImageUrl(imageMedia[0].url)}
              alt={imageMedia[0].caption || anecdote.title}
              className="w-full h-24 object-cover"
            />
          </div>
        )}
        {/* Date Badge */}
        <div className="flex items-center gap-2 text-[#D0FF59] text-xs mb-2">
          <Calendar className="w-3 h-3" />
          {new Date(anecdote.date).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
          })}
        </div>

        {/* Title */}
        <h4 className="text-white font-semibold text-sm mb-2 line-clamp-2">
          {anecdote.title}
        </h4>

        {/* Story Preview */}
        <p className="text-gray-400 text-xs line-clamp-3 mb-3">
          {anecdote.story}
        </p>

        {/* Location */}
        {anecdote.location && (
          <div className="flex items-center gap-1 text-gray-500 text-xs mb-2">
            <MapPin className="w-3 h-3" />
            <span className="truncate">{anecdote.location}</span>
          </div>
        )}

        {/* Storyteller */}
        <div className="flex items-center gap-2 text-gray-500 text-xs">
          <User className="w-3 h-3" />
          {anecdote.storyteller}
        </div>

        {/* Tags */}
        {anecdote.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {anecdote.tags.slice(0, 2).map(tag => (
              <span 
                key={tag}
                className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded-full"
              >
                #{tag}
              </span>
            ))}
            {anecdote.tags.length > 2 && (
              <span className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded-full">
                +{anecdote.tags.length - 2}
              </span>
            )}
          </div>
        )}

        {/* Media Thumbnail */}
        {anecdote.media.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-700">
            <div className="flex items-center gap-2">
              {/* Show first image thumbnail */}
              {imageMedia.length > 0 && (
                <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                  <img 
                    src={getImageUrl(imageMedia[0].url)} 
                    alt="" 
                    className="w-full h-full object-cover"
                  />
                  {anecdote.media.length > 1 && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <span className="text-white text-[10px] font-medium">+{anecdote.media.length - 1}</span>
                    </div>
                  )}
                </div>
              )}
              
              {/* Show media info */}
              <div className="flex-1 min-w-0">
                <p className="text-gray-400 text-[10px]">
                  {anecdote.media.length} media
                </p>
                <div className="flex gap-1 mt-0.5">
                  {imageMedia.length > 0 && (
                    <span className="text-[8px] px-1 py-0.5 bg-gray-700 text-gray-300 rounded">
                      {imageMedia.length} photo{imageMedia.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {otherMedia.length > 0 && (
                    <span className="text-[8px] px-1 py-0.5 bg-gray-700 text-gray-300 rounded">
                      {otherMedia.length} video
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
