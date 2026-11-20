import { contextFor, corsHeaders, hmac256, json, secureCode, secureToken, sha256 } from '../_shared/http.ts'

const acceptanceText = 'Confirmo que li e concordo com os itens, materiais, quantidades, valor total, prazo estimado e condições deste orçamento. Autorizo a marcenaria a iniciar a execução do projeto após esta assinatura.'

export default {
  fetch: async (request: Request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

    const { data: context, error: authError } = await contextFor(request, 'user')
    if (authError || !context) return json({ error: 'Entre na sua conta para compartilhar o orçamento.' }, 401)

    try {
      const { quoteId, roomPaths } = await request.json()
      if (typeof quoteId !== 'string' || !/^[0-9a-f-]{36}$/i.test(quoteId)) return json({ error: 'Orçamento inválido.' }, 400)
      if (roomPaths !== undefined && (!Array.isArray(roomPaths) || roomPaths.length > 8 ||
        roomPaths.some(path => typeof path !== 'string') || new Set(roomPaths).size !== roomPaths.length)) {
        return json({ error: 'Selecione até oito modelos diferentes para a sala.' }, 400)
      }

      const { data: userData, error: userError } = await context.supabase.auth.getUser()
      if (userError || !userData.user) return json({ error: 'Sessão inválida. Entre novamente.' }, 401)

      const { data: quote, error: quoteError } = await context.supabase
        .from('quotes')
        .select('*, contacts(name, phone)')
        .eq('id', quoteId)
        .eq('user_id', userData.user.id)
        .single()

      if (quoteError || !quote) return json({ error: 'Orçamento não encontrado nesta conta.' }, 404)
      if (quote.status !== 'pending' || quote.signed_at) return json({ error: 'Este orçamento não está disponível para assinatura.' }, 409)
      const contact = quote.contacts as { name?: string; phone?: string } | null
      const phone = (contact?.phone ?? '').replace(/\D/g, '')
      if (phone.length < 10 || phone.length > 15) return json({ error: 'Cadastre um WhatsApp válido para o cliente antes de compartilhar.' }, 422)
      const phoneWithCountry = phone.length === 10 || phone.length === 11 ? `55${phone}` : phone
      const secret = Deno.env.get('QUOTE_CODE_HMAC_SECRET')
      if (!secret || secret.length < 32) return json({ error: 'O código seguro ainda não foi configurado no Supabase.' }, 503)

      const token = secureToken()
      const code = secureCode()
      const tokenHash = await sha256(token)
      const codeHash = await hmac256(secret, `${tokenHash}:${code}`)
      const createdAt = new Date()
      const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000)
      const quoteFiles: Record<string, unknown>[] = Array.isArray(quote.attachments) ? quote.attachments : []
      const models = (roomPaths ?? []).map((path: string) => quoteFiles.find(file =>
        file.path === path && path.startsWith(`${userData.user.id}/${quoteId}/`) &&
        path.toLowerCase().endsWith('.glb')))
      if (models.some((model: unknown) => !model)) return json({ error: 'Selecione apenas modelos GLB anexados a este orçamento.' }, 422)
      const roomCode = models.length ? Array.from(crypto.getRandomValues(new Uint32Array(4)),
        value => String.fromCharCode(65 + value % 26)).join('') : null
      const items = Array.isArray(quote.items) ? quote.items.map((item: Record<string, unknown>) => ({
        description: String(item.description ?? ''),
        unit: String(item.unit ?? 'un'),
        quantity: Number(item.quantity ?? 0),
        unitPrice: Number(item.unitPrice ?? item.unit_price ?? 0),
      })) : []
      const attachments = quoteFiles.filter(file => !String(file.path).toLowerCase().endsWith('.glb')).map(file => {
        const path = String(file.path ?? '')
        if (!path.startsWith(`${userData.user.id}/${quoteId}/`)) throw new Error('Invalid attachment ownership')
        return { path, name: String(file.name ?? 'Arquivo do projeto'), mimeType: String(file.mime_type ?? 'application/octet-stream'), size: Number(file.size ?? 0) }
      })
      const snapshot = {
        number: String(quote.number),
        title: String(quote.title),
        shopName: String(userData.user.user_metadata?.full_name ?? 'Marcenaria'),
        clientName: String(contact?.name ?? 'Cliente'),
        createdAt: String(quote.created_at),
        validUntil: quote.valid_until ? String(quote.valid_until) : null,
        deliveryEstimate: String(quote.delivery_estimate ?? ''),
        paymentTerms: String(quote.payment_terms ?? ''),
        notes: String(quote.notes ?? ''),
        items,
        attachments,
        hasShowroom: Boolean(roomCode),
        subtotal: Number(quote.subtotal),
        discount: Number(quote.discount),
        total: Number(quote.total),
        acceptanceText,
      }
      const documentHash = await sha256(JSON.stringify(snapshot))

      const { error: revokeError } = await context.supabaseAdmin
        .from('quote_shares')
        .update({ revoked_at: createdAt.toISOString() })
        .eq('quote_id', quoteId)
        .eq('user_id', userData.user.id)
        .is('revoked_at', null)
        .is('signed_at', null)
      if (revokeError) throw revokeError

      const { error: insertError } = await context.supabaseAdmin.from('quote_shares').insert({
        quote_id: quoteId,
        user_id: userData.user.id,
        token_hash: tokenHash,
        code_hash: codeHash,
        document_hash: documentHash,
        snapshot,
        expires_at: expiresAt.toISOString(),
        code_expires_at: expiresAt.toISOString(),
      })
      if (insertError) throw insertError
      if (roomCode) {
        const { error } = await context.supabaseAdmin.from('private_showroom_rooms').upsert({
          quote_id: quoteId,
          user_id: userData.user.id,
          code_hash: await hmac256(secret, `room:${tokenHash}:${roomCode}`),
          token_hash: tokenHash,
          failed_attempts: 0,
          title: String(quote.title),
          models: models.map((model: Record<string, unknown>) => ({
            path: String(model.path), name: String(model.name ?? 'Móvel').replace(/\.glb$/i, '').slice(0, 140),
          })),
          expires_at: expiresAt.toISOString(),
        })
        if (error) throw error
      } else if (roomPaths !== undefined) {
        const { error } = await context.supabaseAdmin.from('private_showroom_rooms').delete()
          .eq('quote_id', quoteId).eq('user_id', userData.user.id)
        if (error) throw error
      }

      return Response.json({ token, code, roomCode: roomCode,
        phone: phoneWithCountry, clientName: snapshot.clientName, expiresAt: expiresAt.toISOString() },
      { headers: { ...corsHeaders, 'Cache-Control': 'no-store' } })
    } catch (error) {
      console.error('issue-quote-share failed', error instanceof Error ? error.message : 'unknown error')
      return json({ error: 'Não foi possível preparar o compartilhamento. Tente novamente.' }, 500)
    }
  },
}
