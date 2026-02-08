/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api } from '@/services/api';
import type { Anecdote } from '@/types';

interface TimelineContextType {
  anecdotes: Anecdote[];
  isLoading: boolean;
  error: string | null;
  selectedYear: number | null;
  selectedAnecdote: Anecdote | null;
  isEditing: boolean;
  expandedAnecdote: Anecdote | null;
  addAnecdote: (anecdote: Omit<Anecdote, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateAnecdote: (id: string, updates: Partial<Anecdote>) => Promise<void>;
  deleteAnecdote: (id: string) => Promise<void>;
  selectYear: (year: number | null) => void;
  selectAnecdote: (anecdote: Anecdote | null) => void;
  setEditing: (editing: boolean) => void;
  setExpandedAnecdote: (anecdote: Anecdote | null) => void;
  getAnecdotesByYear: (year: number) => Anecdote[];
  getAllYears: () => number[];
  refreshAnecdotes: () => Promise<void>;
}

const TimelineContext = createContext<TimelineContextType | undefined>(undefined);

export function TimelineProvider({ children }: { children: React.ReactNode }) {
  const [anecdotes, setAnecdotes] = useState<Anecdote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedAnecdote, setSelectedAnecdote] = useState<Anecdote | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [expandedAnecdote, setExpandedAnecdote] = useState<Anecdote | null>(null);

  const refreshAnecdotes = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getAnecdotes();
      setAnecdotes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load anecdotes');
      console.error('Error loading anecdotes:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load anecdotes from API on mount
  useEffect(() => {
    refreshAnecdotes();
  }, [refreshAnecdotes]);

  const addAnecdote = useCallback(async (anecdote: Omit<Anecdote, 'id' | 'createdAt' | 'updatedAt'>) => {
    setIsLoading(true);
    setError(null);
    try {
      const newAnecdote = await api.createAnecdote(anecdote);
      setAnecdotes(prev => [...prev, newAnecdote]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create anecdote');
      console.error('Error creating anecdote:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateAnecdote = useCallback(async (id: string, updates: Partial<Anecdote>) => {
    setIsLoading(true);
    setError(null);
    try {
      const updatedAnecdote = await api.updateAnecdote(id, updates);
      setAnecdotes(prev =>
        prev.map(a => (a.id === id ? updatedAnecdote : a))
      );
      if (selectedAnecdote?.id === id) {
        setSelectedAnecdote(updatedAnecdote);
      }
      if (expandedAnecdote?.id === id) {
        setExpandedAnecdote(updatedAnecdote);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update anecdote');
      console.error('Error updating anecdote:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [selectedAnecdote, expandedAnecdote]);

  const deleteAnecdote = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await api.deleteAnecdote(id);
      setAnecdotes(prev => prev.filter(a => a.id !== id));
      if (selectedAnecdote?.id === id) {
        setSelectedAnecdote(null);
      }
      if (expandedAnecdote?.id === id) {
        setExpandedAnecdote(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete anecdote');
      console.error('Error deleting anecdote:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [selectedAnecdote, expandedAnecdote]);

  const selectYear = useCallback((year: number | null) => {
    setSelectedYear(year);
  }, []);

  const selectAnecdote = useCallback((anecdote: Anecdote | null) => {
    setSelectedAnecdote(anecdote);
  }, []);

  const setEditing = useCallback((editing: boolean) => {
    setIsEditing(editing);
  }, []);

  const getAnecdotesByYear = useCallback((year: number) => {
    return anecdotes
      .filter(a => a.year === year)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [anecdotes]);

  const getAllYears = useCallback(() => {
    const years = [...new Set(anecdotes.map(a => a.year))];
    return years.sort((a, b) => a - b);
  }, [anecdotes]);

  return (
    <TimelineContext.Provider
      value={{
        anecdotes,
        isLoading,
        error,
        selectedYear,
        selectedAnecdote,
        isEditing,
        expandedAnecdote,
        addAnecdote,
        updateAnecdote,
        deleteAnecdote,
        selectYear,
        selectAnecdote,
        setEditing,
        setExpandedAnecdote,
        getAnecdotesByYear,
        getAllYears,
        refreshAnecdotes,
      }}
    >
      {children}
    </TimelineContext.Provider>
  );
}

export function useTimeline() {
  const context = useContext(TimelineContext);
  if (context === undefined) {
    throw new Error('useTimeline must be used within a TimelineProvider');
  }
  return context;
}
