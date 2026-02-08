import type { Anecdote, Storyline } from '@/types';

// Get the base URL without /api suffix for uploads
const getBaseUrl = () => {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
  return apiUrl.replace('/api', '');
};

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
export const UPLOADS_BASE_URL = getBaseUrl();

// Get stored access key
const getAccessKey = (): string | null => {
  return localStorage.getItem('afrobeats_access_key');
};

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const accessKey = getAccessKey();
  
  const headers: Record<string, string> = {
    ...options?.headers as Record<string, string>,
  };
  
  // Add access key header for write operations
  if (accessKey && (options?.method === 'POST' || options?.method === 'PUT' || options?.method === 'DELETE')) {
    headers['X-Access-Key'] = accessKey;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(response.status, error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Get API base URL
  getApiBaseUrl: () => API_BASE_URL,

  // Get full URL for uploads
  getUploadsUrl: (path: string) => `${UPLOADS_BASE_URL}${path}`,

  // Health check
  health: () => fetchApi<{ status: string; timestamp: string }>('/health'),

  // Image upload (requires auth)
  uploadImage: async (file: File): Promise<{ url: string; filename: string; success?: boolean }> => {
    const accessKey = getAccessKey();
    const formData = new FormData();
    formData.append('image', file);

    const headers: Record<string, string> = {};
    if (accessKey) {
      headers['X-Access-Key'] = accessKey;
    }

    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new ApiError(response.status, error.error || `HTTP ${response.status}`);
    }

    return response.json();
  },

  // Multiple images upload (requires auth)
  uploadImages: async (files: File[]): Promise<{ files: Array<{ url: string; filename: string; originalName: string; size: number }> }> => {
    const accessKey = getAccessKey();
    const formData = new FormData();
    files.forEach(file => formData.append('images', file));

    const headers: Record<string, string> = {};
    if (accessKey) {
      headers['X-Access-Key'] = accessKey;
    }

    const response = await fetch(`${API_BASE_URL}/upload/multiple`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new ApiError(response.status, error.error || `HTTP ${response.status}`);
    }

    return response.json();
  },

  // Delete image (requires auth)
  deleteImage: (filename: string) => fetchApi<{ message: string }>(`/upload/${filename}`, {
    method: 'DELETE',
  }),

  // Anecdotes
  getAnecdotes: () => fetchApi<Anecdote[]>('/anecdotes'),
  
  getAnecdoteById: (id: string) => fetchApi<Anecdote>(`/anecdotes/${id}`),
  
  getAnecdotesByYear: (year: number) => fetchApi<Anecdote[]>(`/anecdotes/year/${year}`),
  
  // Create anecdote (requires auth)
  createAnecdote: (anecdote: Omit<Anecdote, 'id' | 'createdAt' | 'updatedAt'>) =>
    fetchApi<Anecdote>('/anecdotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(anecdote),
    }),
  
  // Update anecdote (requires auth)
  updateAnecdote: (id: string, updates: Partial<Anecdote>) =>
    fetchApi<Anecdote>(`/anecdotes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }),
  
  // Delete anecdote (requires auth)
  deleteAnecdote: (id: string) => fetchApi<{ message: string }>(`/anecdotes/${id}`, {
    method: 'DELETE',
  }),

  // Graph data (public)
  getGraphData: () => fetchApi<{
    nodes: Array<{
      id: string;
      type: 'anecdote' | 'storyteller' | 'year' | 'tag';
      label: string;
    }>;
    links: Array<{
      source: string;
      target: string;
      type: 'date' | 'storyteller' | 'tag';
    }>;
  }>('/graph'),

  // Storylines
  getStorylines: () => fetchApi<Storyline[]>('/storylines'),

  // Save storylines (requires auth)
  saveStorylines: (storylines: Storyline[]) =>
    fetchApi<{ success: boolean; count: number }>('/storylines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storylines }),
    }),

  // Verify access key
  verifyKey: async (key: string): Promise<{ valid: boolean; error?: string }> => {
    const response = await fetch(`${API_BASE_URL}/verify-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });

    const data = await response.json();
    return data;
  },
};
