// In development, Vite proxy handles /api -> localhost:3001
// In production, this points to the Railway backend URL
// Set VITE_API_URL in Vercel environment variables to your Railway URL
export const API_BASE = import.meta.env.VITE_API_URL || '';
