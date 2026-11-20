# Central da oficina e showroom digital

A visão geral usa a sessão e os dados que o aplicativo já carrega. Projetos, contatos e produtos continuam nos módulos existentes. A produção abre Projetos, o showroom da maquete abre Contatos e o depósito abre Produtos. A sede é conceitual e tem como referência a imagem fornecida pelo usuário.

## Desenvolvimento

- `npm run dev` abre o aplicativo. A galeria pública de demonstração fica em `/showroom`.
- `npm run build` verifica TypeScript e cria a distribuição Vite. O projeto não possui comando de lint.
- Para reconstruir os modelos com Blender 5.2, execute `blender -b --python-exit-code 1 --python scripts/build-campus.py` e `blender -b --python-exit-code 1 --python scripts/build-showroom.py`. No Windows, use o caminho para `blender.exe` se o executável não estiver no PATH.

## Dashboard

`CampusDashboard.tsx` compõe a vista, os painéis e os atalhos. `CampusScene.tsx` carrega Three.js e o GLB sob demanda. `campus-walk.ts` contém o personagem, a câmera em terceira pessoa, os limites físicos e a detecção de salas. As paredes e entradas precisam acompanhar as medidas de `build-campus.py`.

O modelo ocupa toda a largura da visão geral, com navegação em degradê sobre a cena. **Resumo** abre os indicadores, atalhos e projetos recentes em um painel flutuante. A API Fullscreen expande a cena para fora da interface do navegador. Os três pontos na vista aérea selecionam setores e movem a câmera. **Explorar a pé** ativa o personagem. Use WASD, setas ou o direcional para atravessar as entradas. Esc retorna à vista aérea, quando a cena tem foco.

O Blender gera geometria, materiais PBR, mapas procedurais e o WebP de fallback em `public/campus/`. A cena usa malhas agrupadas por material, sombras estáticas no desktop, densidade de pixels limitada e atualização interrompida fora da tela. Movimento reduzido começa na imagem e permite 3D sem animações automáticas. Falhas de carregamento, ausência de WebGL e baixa cadência sustentada exibem a imagem com botões de navegação.

## Showroom público

`ShowroomPage.tsx` abre diretamente uma sala em primeira pessoa. `ShowroomRoom.tsx` monta as seis peças nas vitrines, trata movimento e colisões e permite inspecionar os itens. A sala renderiza sob demanda. A galeria com filtros aparece como alternativa quando a sala não carrega. As prévias e os GLBs em `public/showroom/` foram gerados pelo Blender. A rota não monta a sessão nem faz consultas ao Supabase. Substituir as peças de demonstração por um catálogo real exige fotos, modelos ou especificações aprovadas da oficina.

A sala mede 17 × 26 m. Os mapas de cor e normal de 1K em `public/showroom/materials/` são do Poly Haven, sob [licença CC0](https://polyhaven.com/license). Materiais usados: [Wood Floor](https://polyhaven.com/a/wood_floor), [Beige Wall 001](https://polyhaven.com/a/beige_wall_001) e [Concrete Floor Worn 001](https://polyhaven.com/a/concrete_floor_worn_001).

As exposições do SketchUp são exportadas para .showroom-local e carregadas pelo armazenamento privado. Para reconstruí-las, use `blender -b --python-exit-code 1 -P scripts/import-cristina-showroom.py -- caminho/para/CRISTINA-LOJA.dae`. O script converte polegadas em metros, separa a marcenaria das ferragens e exporta apenas as superfícies selecionadas. O DAE original fica fora da pasta pública.

## Sala privada por orçamento

Anexe os modelos em GLB no novo projeto e selecione até oito deles ao compartilhar. O código da sala acompanha o orçamento no WhatsApp e é independente do código de assinatura. A proposta pública oferece o atalho, sem incluir o código da sala nem os GLBs. A porta lateral e o botão **Minha sala** levam ao mesmo formulário.

Os códigos novos têm quatro letras, exigem o link do orçamento e permitem até oito erros por emissão. Os códigos de demonstração antigos seguem válidos até expirar. O código vale por sete dias. Cada entrada libera URLs assinadas por até 15 minutos e a interface mantém a sessão apenas em memória. Gerar um novo código para o mesmo orçamento substitui o anterior. A migração `20261120160537_private_showroom_rooms.sql` e as Edge Functions `issue-quote-share`, `get-quote-share` e `open-showroom-room` já estão ativas no Supabase vinculado.

## Ferramentas

Tripo CLI 0.11.2 instalado e servidor stdio cadastrado no Codex com `tripo.cmd mcp`. `tripo doctor` confirmou a versão de Node e indicou autorização de conta pendente. A modelagem desta versão foi feita no Blender e não consumiu créditos do Tripo.

## Validação local

Edge com Playwright em 1440 e 390 px. O fluxo incluiu carregamento do GLB, tela cheia no desktop, hotspot, zoom, entrada no Administrativo com teclado e direcional, navegação e abertura do novo projeto. A conta foi simulada apenas no navegador de teste. Também foram verificados o fallback com WebGL desativado, movimento reduzido e o showroom sem login e sem consultas ao Supabase. As cinco entradas e a colisão na parede frontal foram conferidas na lógica de movimento. A máquina de teste usou renderização por software, então o resultado não estabelece metas de FPS para aparelhos reais.
