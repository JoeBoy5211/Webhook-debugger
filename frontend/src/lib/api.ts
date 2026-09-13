import axios, { AxiosError } from 'axios';

export const API_URL = (import.meta.env as any).VITE_API_URL || 'http://localhost:3001/api';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: string }>;
    if (axiosError.code === 'ECONNABORTED') {
      return 'Request timed out. Please try again.';
    }
    if (!axiosError.response) {
      return 'Network error. Check your connection and try again.';
    }
    return axiosError.response.data?.error || axiosError.message || 'Request failed';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong';
}
