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
        .select('snapshot, expires_at, code_expires_at, attempt_count, revoked_at, signed_at, signed_by, signature_data, document_hash')
        .eq('token_hash', tokenHash)
        .maybeSingle()

      if (error || !share || share.revoked_at || new Date(share.expires_at).getTime() <= Date.now()) return json({ error: 'Este link expirou ou não está mais ativo.' }, 410)
      if (share.signed_at) return json({ quote: share.snapshot, status: 'signed', signedAt: share.signed_at, signedBy: share.signed_by, signatureData: share.signature_data, documentHash: share.document_hash })
      if (share.attempt_count >= 5) return json({ quote: share.snapshot, status: 'locked' })
      return json({ quote: share.snapshot, status: 'pending', codeExpiresAt: share.code_expires_at })
    } catch {
      return json({ error: 'Não foi possível carregar este orçamento.' }, 400)
    }
  },
}
