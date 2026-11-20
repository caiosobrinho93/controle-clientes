import { contextFor, corsHeaders, hmac256, json, sha256 } from '../_shared/http.ts'

const unavailable = () => json({ error: 'Código inválido ou expirado.' }, 404)

export default {
  fetch: async (request: Request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
    try {
      const { code: input, token } = await request.json()
      if (typeof input !== 'string' || input.length > 40) return unavailable()
      const code = input.replace(/[\s-]/g, '').toUpperCase()
      const scoped = typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token)
      if (scoped ? !/^[A-Z]{4}$/.test(code) : token !== undefined || !/^[A-F0-9]{24}$/.test(code)) return unavailable()

      const { data: context, error: contextError } = await contextFor(request, 'none')
      if (contextError || !context) return json({ error: 'A sala está indisponível no momento.' }, 503)
      const secret = Deno.env.get('QUOTE_CODE_HMAC_SECRET')
      if (scoped && (!secret || secret.length < 32)) return json({ error: 'A sala está indisponível no momento.' }, 503)
      const tokenHash = scoped ? await sha256(token) : ''
      const codeHash = scoped ? await hmac256(secret!, `room:${tokenHash}:${code}`) : await sha256(code)
      const { data: room, error } = scoped
        ? await context.supabaseAdmin.rpc('open_private_showroom', { p_token_hash: tokenHash, p_code_hash: codeHash }).maybeSingle()
        : await context.supabaseAdmin.from('private_showroom_rooms')
        .select('quote_id,user_id,title,models,expires_at')
        .eq('code_hash', codeHash).is('token_hash', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()
      if (error) return json({ error: 'A sala está indisponível no momento.' }, 503)
      if (!room || (scoped && room.code_hash !== codeHash)) return unavailable()
      const models = room.models as { path: string; name: string }[]
      if (!Array.isArray(models) || !models.length || models.some(model =>
        !model.path.startsWith(`${room.user_id}/${room.quote_id}/`) || !model.path.toLowerCase().endsWith('.glb'))) {
        return json({ error: 'A sala está indisponível no momento.' }, 503)
      }
      const remaining = Math.floor((new Date(room.expires_at).getTime() - Date.now()) / 1000)
      const seconds = Math.min(15 * 60, remaining)
      if (seconds < 1) return unavailable()
      const { data: urls, error: storageError } = await context.supabaseAdmin.storage.from('project-files')
        .createSignedUrls(models.map(model => model.path), seconds)
      if (storageError || !urls || urls.length !== models.length || urls.some(item => item.error || !item.signedUrl)) {
        return json({ error: 'Não foi possível abrir os modelos. Tente novamente.' }, 503)
      }
      return Response.json({
        title: room.title,
        expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
        models: models.map((model, index) => ({ name: model.name, url: urls[index].signedUrl })),
      }, { headers: { ...corsHeaders, 'Cache-Control': 'no-store' } })
    } catch {
      return json({ error: 'Não foi possível abrir a sala.' }, 400)
    }
  },
}
