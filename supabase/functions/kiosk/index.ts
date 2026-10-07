
import { createHandler } from './handler.js';

const publishableKeys = Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}')) as string[];
const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const backendKey = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const url = Deno.env.get('SUPABASE_URL');
const allowedOrigins = (Deno.env.get('KIOSK_ALLOWED_ORIGINS') ||
  'http://localhost:4173,http://127.0.0.1:4173,http://localhost:5500,http://127.0.0.1:5500,https://triple-j-pos-kiosk.vercel.app,https://triple-j-pos-kiosk-mencedejeward-5545.vercel.app,https://triple-j-pos-kiosk-ei6r5ivl4-mencedejeward-5545.vercel.app').split(',').map((s:string)=>s.trim()).filter(Boolean);

Deno.serve(createHandler({
  publishableKeys, allowedOrigins,
  database: async (path:string, options:{method:string;body?:unknown}) => {
    if (!url || !backendKey) throw new Error('Missing backend configuration');
    const headers: Record<string,string> = {apikey:backendKey,'Content-Type':'application/json'};
    if (!backendKey.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + backendKey;
    const response = await fetch(url + '/rest/v1/' + path, {
      method:options.method,headers,
      ...(options.body !== undefined && {body:JSON.stringify(options.body)}),
      signal:AbortSignal.timeout(20000)
    });
    if (!response.ok) {
      console.error('Database request failed:',response.status);
      throw new Error('Database request failed');
    }
    return response.json();
  }
}));
