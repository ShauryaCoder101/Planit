import { useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { API_BASE } from '../config.js';

// Convert snake_case keys to camelCase recursively
function toCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function transformKeys(obj) {
  if (Array.isArray(obj)) return obj.map(transformKeys);
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.keys(obj).reduce((acc, key) => {
      acc[toCamel(key)] = transformKeys(obj[key]);
      return acc;
    }, {});
  }
  return obj;
}

// Convert camelCase keys to snake_case for request bodies
function toSnake(str) {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function transformKeysToSnake(obj) {
  if (Array.isArray(obj)) return obj.map(transformKeysToSnake);
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.keys(obj).reduce((acc, key) => {
      acc[toSnake(key)] = transformKeysToSnake(obj[key]);
      return acc;
    }, {});
  }
  return obj;
}

export function useApi() {
  const { token, logout } = useAuth();

  const request = useCallback(async (method, url, body = undefined) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const opts = { method, headers };
    if (body !== undefined) {
      opts.body = JSON.stringify(transformKeysToSnake(body));
    }
    const fullUrl = `${API_BASE}${url}`;
    const res = await fetch(fullUrl, opts);
    if (res.status === 401) {
      logout();
      throw new Error('Session expired');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Request failed (${res.status})`);
    }
    if (res.status === 204) return null;
    const data = await res.json();
    return transformKeys(data);
  }, [token, logout]);

  const api = useMemo(() => ({
    get: (url) => request('GET', url),
    post: (url, body) => request('POST', url, body),
    put: (url, body) => request('PUT', url, body),
    del: (url) => request('DELETE', url),
  }), [request]);

  return api;
}
