import { contextFor, corsHeaders, json, sha256 } from '../_shared/http.ts'

export default {
  fetch: async (request: Request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
    const { data: context, error: contextError } = await contextFor(request, 'none')
    if (contextError || !context) return json({ error: 'Não foi possível carregar este orçamento.' }, 500)

    try {
      const { token } = await request.json()
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return json({ error: 'Este link não é válido.' }, 404)
      const tokenHash = await sha256(token)
      const { data: share, error } = await context.supabaseAdmin
        .from('quote_shares')
        .select('snapshot, quote_id, user_id, expires_at, code_expires_at, attempt_count, revoked_at, signed_at, signed_by, signature_data, document_hash')
        .eq('token_hash', tokenHash)
        .maybeSingle()

      if (error || !share || share.revoked_at || new Date(share.expires_at).getTime() <= Date.now()) return json({ error: 'Este link expirou ou não está mais ativo.' }, 410)
      const snapshot = share.snapshot as Record<string, unknown>
      const attachments = Array.isArray(snapshot.attachments) ? await Promise.all(snapshot.attachments.map(async (file: Record<string, unknown>) => {
        const path = String(file.path ?? '')
        if (!path.startsWith(`${share.user_id}/${share.quote_id}/`)) throw new Error('Invalid attachment ownership')
        const { data, error: signError } = await context.supabaseAdmin.storage.from('project-files').createSignedUrl(path, 30 * 60)
        if (signError || !data?.signedUrl) throw signError ?? new Error('Could not sign attachment')
        return { name: String(file.name ?? 'Arquivo do projeto'), mimeType: String(file.mimeType ?? 'application/octet-stream'), size: Number(file.size ?? 0), url: data.signedUrl }
      })) : []
      const quote = { ...snapshot, attachments }
      if (share.signed_at) return json({ quote, status: 'signed', signedAt: share.signed_at, signedBy: share.signed_by, signatureData: share.signature_data, documentHash: share.document_hash })
      if (share.attempt_count >= 5) return json({ quote, status: 'locked' })
      return json({ quote, status: 'pending', codeExpiresAt: share.code_expires_at })
    } catch {
      return json({ error: 'Não foi possível carregar este orçamento.' }, 400)
    }
  },
}
