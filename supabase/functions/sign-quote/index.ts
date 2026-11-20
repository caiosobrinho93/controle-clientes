import { contextFor, corsHeaders, hmac256, json, sha256, validSignatureData } from '../_shared/http.ts'

export default {
  fetch: async (request: Request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
    const { data: context, error: contextError } = await contextFor(request, 'none')
    if (contextError || !context) return json({ error: 'Não foi possível validar a assinatura.' }, 500)

    try {
      const { token, code, fullName, signatureData } = await request.json()
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return json({ error: 'Link de assinatura inválido.' }, 404)
      if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return json({ error: 'Digite o código de seis números recebido no WhatsApp.' }, 400)
      if (typeof fullName !== 'string' || fullName.trim().length < 3 || fullName.trim().length > 120) return json({ error: 'Informe seu nome completo.' }, 400)
      if (!validSignatureData(signatureData)) return json({ error: 'Faça sua assinatura no campo antes de continuar.' }, 400)
      const secret = Deno.env.get('QUOTE_CODE_HMAC_SECRET')
      if (!secret || secret.length < 32) return json({ error: 'A validação segura ainda não está configurada.' }, 503)

      const tokenHash = await sha256(token)
      const codeHash = await hmac256(secret, `${tokenHash}:${code}`)
      const { data: result, error } = await context.supabaseAdmin.rpc('complete_quote_signature', {
        p_token_hash: tokenHash,
        p_code_hash: codeHash,
        p_full_name: fullName.trim(),
        p_signature_data: signatureData,
      })
      if (error) throw error
      if (result === 'signed') {
        const { data: signedShare } = await context.supabaseAdmin
          .from('quote_shares')
          .select('signed_at, signed_by, signature_data, document_hash')
          .eq('token_hash', tokenHash)
          .single()
        return json({ status: 'signed', signedAt: signedShare?.signed_at, signedBy: signedShare?.signed_by, signatureData: signedShare?.signature_data, documentHash: signedShare?.document_hash })
      }
      const messages: Record<string, string> = {
        expired_link: 'Este link expirou. Peça à marcenaria para enviar um novo.',
        expired_code: 'O código expirou. Peça à marcenaria para gerar um novo compartilhamento.',
        already_signed: 'Este orçamento já foi assinado.',
        locked: 'O limite de tentativas foi atingido. Peça um novo código à marcenaria.',
        invalid_code: 'Código incorreto. Confira a mensagem do WhatsApp e tente novamente.',
        invalid_signature: 'A assinatura não foi reconhecida. Assine novamente no campo.',
        quote_not_pending: 'Este orçamento não está mais aguardando assinatura.',
      }
      const status = result === 'invalid_code' ? 400 : result === 'locked' ? 429 : 409
      return json({ error: messages[result] ?? 'Não foi possível registrar a assinatura.' }, status)
    } catch (error) {
      console.error('sign-quote failed', error instanceof Error ? error.message : 'unknown error')
      return json({ error: 'Não foi possível registrar a assinatura. Tente novamente.' }, 500)
    }
  },
}
