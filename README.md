# Oficina

Dashboard para marcenarias com contatos, catálogo privado de custos, criação de orçamentos e aceite do cliente por link e código enviado no WhatsApp. O PDF é uma proposta comercial e contrato de aceite; não é nota fiscal.

## Rodar localmente

1. Use Node.js 20.19+ ou 22.12+ e execute `npm install`.
2. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Execute, nesta ordem, os arquivos SQL em `supabase/migrations/` no projeto Supabase.
4. Configure Auth com os endereços locais e do site final.
5. Configure o segredo `QUOTE_CODE_HMAC_SECRET` (mínimo de 32 caracteres) como segredo das Edge Functions e publique `issue-quote-share`, `get-quote-share` e `sign-quote` no Supabase.
6. Rode `npm run dev`.

Sem as variáveis do Supabase, o site mostra a tela de configuração. O fluxo autenticado e a persistência só funcionam depois de configurar o Supabase.

## Fluxo do produto

- Cada conta gerencia seus contatos e sua biblioteca de materiais, serviços e custos.
- O orçamento usa multiplicador de 2 a 4,5, calcula o valor sugerido e permite aplicar desconto.
- A marcenaria gera um link privado de sete dias e um código de seis dígitos para enviar ao cliente pelo WhatsApp.
- O cliente não precisa criar conta. Revisa os itens, valores e condições, informa o código, escreve o nome completo, desenha a assinatura e aceita os termos.
- O sistema registra o aceite e permite baixar a proposta assinada em PDF.

## Segurança e dados

Contatos, orçamentos e produtos têm políticas RLS para isolamento por `auth.uid()`. Dados internos de custo e multiplicador não são incluídos no snapshot público. O código de assinatura é armazenado como HMAC, expira junto ao link e tem até cinco tentativas. A função transacional registra o aceite uma única vez. A chave `service_role` e `QUOTE_CODE_HMAC_SECRET` são segredos de backend; nunca os coloque em variáveis `VITE_` ou no navegador.

O aceite registra nome, imagem de assinatura, data/hora e hash do documento. Isso não equivale a certificado ICP-Brasil nem garante, por si só, validade jurídica automática; a adequação depende do contexto e das partes.

## Publicação futura

O projeto pode ser conectado ao GitHub e hospedado na Vercel quando estiver pronto. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` na Vercel e aplique as migrations/funções no Supabase antes de liberar o fluxo público.
