# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Donos e operadores de marcenarias que cadastram clientes, produtos, custos e projetos.
- Clientes da marcenaria que recebem um link no WhatsApp, consultam uma proposta no celular e, se concordarem, assinam sem criar conta.

## Product Purpose

Organizar o fluxo inicial da marcenaria: contatos, catálogo próprio, composição de projetos, cálculo de preço com multiplicador, compartilhamento de orçamento e confirmação do cliente.

## Positioning

O cliente pode revisar e aceitar o orçamento por um link privado e um código enviado separadamente pelo WhatsApp, sem precisar abrir uma conta.

## Operating Context

O proprietário usa um dashboard autenticado. O cliente normalmente acessa a proposta em um celular. O fluxo de orçamento considera custo de produtos, quantidades, multiplicador e um possível desconto negociado.

## Capabilities and Constraints

- Cada conta vê e altera apenas os próprios contatos, produtos e orçamentos.
- O multiplicador pode variar de 2 a 4,5; valores entre 2 e 3 são os mais comuns para o usuário.
- O cliente vê o orçamento final, sem custos de compra ou multiplicador interno.
- O link de compartilhamento é privado e não exige conta do cliente. O código de segurança é enviado na mensagem de WhatsApp e também é necessário para assinar.
- O aceite padrão registra a concordância com itens, valores, prazo e condições do orçamento.
- O escopo atual é contatos, catálogo de produtos, orçamentos, compartilhamento e aceite. Não publicar nem fazer deploy sem solicitação explícita.
- A plataforma usa GitHub, Vercel e Supabase quando configurados.

## Evidence on Hand

- O projeto local contém a primeira versão do dashboard, mas ainda não há credenciais nem projeto Supabase conectado.
- Não há catálogo, clientes ou contratos reais fornecidos; não inventar esses dados.

## Product Principles

- Manter os dados de cada marcenaria isolados.
- Não exigir conta do cliente para revisar ou assinar uma proposta.
- Enviar o código de assinatura por um canal separado do link.
- Tornar a proposta legível e simples de aprovar pelo celular.
- Separar o custo interno do preço apresentado ao cliente.
