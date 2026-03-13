const FALLBACK_API_URL = 'http://localhost:5000/api';

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || FALLBACK_API_URL).replace(/\/$/, '');

export function buildApiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
