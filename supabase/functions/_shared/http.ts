import { createSupabaseContext } from 'npm:@supabase/server@1.9.2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders })
}

export async function contextFor(request: Request, auth: 'user' | 'none') {
  return createSupabaseContext(request, { auth })
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function hmac256(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function secureToken(byteCount = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteCount))
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export function secureCode() {
  const ceiling = Math.floor(0x100000000 / 1_000_000) * 1_000_000
  const value = new Uint32Array(1)
  do crypto.getRandomValues(value); while (value[0] >= ceiling)
  return String(value[0] % 1_000_000).padStart(6, '0')
}

export function validSignatureData(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 200_000
    && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value)
}
