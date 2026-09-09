# VoiceCraft — Design System (normativo)

Este documento é a fonte de verdade para decisões de interface do VoiceCraft.

**Status:** v1.0 — Setembro de 2026.

**Arquivos de referência visual:**
- `reference-voice.png` — Norma A (sala de voz): "Café da tarde".
- `reference-chat.png` — Norma B (chat de conversa): "Conversa geral".

---

## 1. Fundamentos

### 1.1 Personalidade

| Deve parecer | Não deve parecer |
|---|---|
| Um espaço íntimo e vivo | Um painel administrativo de comunidade |
| Calmo, acolhedor e contemporâneo | Gamer neon, ruidoso ou infantil |
| Personalizável com limites | Uma colcha de gradientes sem hierarquia |
| Rico em presença humana | Uma lista de usuários e indicadores técnicos |
| Direto e previsível | Uma interface escondida atrás de ícones ambíguos |

### 1.2 Modelo mental

| Entidade | Definição | Linguagem de UI |
|---|---|---|
| **Space** | Ambiente principal de um grupo. | "Space" / nome próprio |
| **Sala** | Lugar persistente ou temporário para uma atividade. | "Sala", nunca "canal" |
| **Conversa** | Histórico assíncrono associado a uma sala. | "Conversa" |
| **Encontro** | Sessão de voz ativa dentro de uma sala. | "Na sala agora" |
| **Pessoa** | Participante com presença, identidade e permissões. | "Pessoa" / "participante" |

### 1.3 Princípios

1. **Pessoas antes da infraestrutura** — rostos, atividades e estados têm prioridade sobre IDs, contadores e categorias.
2. **Contexto antes de quantidade** — mostrar o que está acontecendo, não só quantas salas existem.
3. **Uma ação principal por região** — cada card/modal/cabeçalho tem uma CTA dominante.
4. **Personalização contida** — o Space colore acentos; a interface global permanece neutra.
5. **Progressive disclosure** — admin, permissões e detalhes avançados só quando necessário.

---

## 2. Tokens

### 2.1 Paleta base (tema escuro)

| Token | Valor | Uso |
|---|---|---|
| `--vc-bg-canvas` | `#0D0F14` | Fundo da área principal |
| `--vc-bg-rail` | `#111318` | Rail global |
| `--vc-bg-panel` | `#15171D` | Painel contextual |
| `--vc-surface-1` | `#191C23` | Cards e superfícies |
| `--vc-surface-2` | `#20242D` | Hover e elevação |
| `--vc-border` | `#2A303A` | Bordas padrão |
| `--vc-text-strong` | `#F6F7F9` | Títulos e conteúdo primário |
| `--vc-text` | `#D9DCE3` | Texto |
| `--vc-text-muted` | `#8D95A3` | Metadados |
| `--vc-positive` | `#32C48D` | Online/conectado |
| `--vc-warning` | `#F5B942` | Atenção |
| `--vc-danger` | `#F0445E` | Sair, excluir, erro |
| `--space-accent` | `#FF3F6C` | Ação principal e identidade local |
| `--space-accent-soft` | `rgba(255,63,108,.14)` | Seleção e fundos suaves |

**Contraste:** texto normal ≥ 4,5:1; texto grande e ícones essenciais ≥ 3:1. Cor nunca é o único indicador de estado.

### 2.2 Tipografia

| Estilo | Tamanho/linha | Peso | Uso |
|---|---|---|---|
| Display | 40/48 | 700 | Título da sala de voz ou boas-vindas |
| H1 | 28/36 | 700 | Título principal de página |
| H2 | 20/28 | 650 | Seções e cards importantes |
| H3 | 16/24 | 600 | Card, pessoa e sala |
| Body | 14/21 | 400 | Mensagens e descrições |
| Small | 12/18 | 400–600 | Status e metadados |
| Micro | 11/16 | 600 | Labels e indicadores |

Família: `Inter Variable`. Fallback: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`.

### 2.3 Espaçamento, raios e elevação

- **Espaçamento:** 4, 8, 12, 16, 20, 24, 32, 40, 48 px (múltiplos de 4; 16 é a unidade mais comum).
- **Raios:** 8 (inputs), 12 (inputs), 16 (cards), 20 (modais), 999 (pills).
- **Bordas:** 1 px padrão; 2 px em foco/fala. Nunca usar borda forte em todo elemento.
- **Sombras:** `sm`, `md`, `lg`. Apenas para sobreposição ou elevação real.
- **Blur:** 12–24 px. Reservado a docks e painéis sobre imagem.

---

## 3. Arquitetura da aplicação

### 3.1 Estrutura desktop

| Região | Largura | Responsabilidade |
|---|---|---|
| Barra do app | 64–72 px | Início, Spaces, criar/encontrar, perfil |
| Painel do Space | 272–320 px | Identidade, navegação e salas |
| Área principal | `minmax(640 px, 1fr)` | Visão geral, chat ou sala de voz |
| Painel contextual | 280–320 px (opcional) | Atividade, detalhes ou pessoas |

**Regra de densidade:** a área principal deve usar a largura disponível com conteúdo significativo. Não concentrar cards pequenos no canto superior esquerdo.

### 3.2 Breakpoints

| Faixa | Comportamento |
|---|---|
| ≥ 1440 px | Todas as regiões permitidas; painel contextual aparece quando agrega valor |
| 1100–1439 px | Painel contextual vira drawer; grid reduz colunas |
| 800–1099 px | Painel do Space recolhível; rail permanece |
| < 800 px | Navegação em overlay; foco em uma única região; controles fixos |

### 3.3 Navegação do painel do Space

- **Visão geral** — resumo vivo do Space.
- **Salas** — descoberta, busca e organização por atividade.
- **Pessoas** — diretório pesquisável e permissões quando autorizadas.
- **Eventos** — opcional; só aparece se existir.
- **Configurações** — acessadas pelo menu da identidade do Space, não como item competindo com uso diário.

---

## 4. Componentes essenciais

| Componente | Variantes | Estados obrigatórios |
|---|---|---|
| Button | primary, secondary, ghost, danger, icon | default, hover, active, focus, disabled, loading |
| Input | text, search, textarea | idle, focus, filled, error, disabled |
| Room item | conversation, voice, study, music, game | idle, hover, selected, live, unread |
| Person card | compact, standard, featured | online, offline, speaking, muted, away |
| Avatar | 24, 32, 40, 56, 96, 144 | image, initials, fallback, presence |
| Badge | role, activity, status | neutral, accent, positive, warning |
| Popover | profile, actions, reactions | opening, open, closing |
| Modal | create, confirm, form | open, submitting, error, success |
| Toast | info, success, warning, error | timed, persistent, action |
| Skeleton | text, avatar, card, message | loading, reduced-motion |

### 4.1 Botões

- Alturas: 32 (compacto), 40 (padrão), 48 (destaque).
- Área clicável mínima: 40 × 40 px; 44 × 44 px quando possível.
- Primary usa `--space-accent`; danger nunca reutiliza a cor do Space.
- Ícone sem texto exige tooltip e nome acessível.
- Loading mantém largura e impede clique duplicado.

### 4.2 Cards

- Card não é decoração: representa uma entidade ou ação.
- Hierarquia previsível: cabeçalho, conteúdo, metadado, CTA.
- Hover eleva superfície e borda; não desloca layout.
- Selecionável + botão interno: áreas interativas independentes.
- Imagens de fundo precisam de scrim.

### 4.3 Ícones e mídia

- Família única outline (Lucide ou equivalente).
- Stroke 1,75–2 px. Tamanhos padrão: 16, 20 e 24 px.
- Evitar emojis como ícones estruturais; emojis são conteúdo social.

---

## 5. Sala de voz (normativa A)

### 5.1 Anatomia

| Região | Conteúdo |
|---|---|
| Cabeçalho | Breadcrumb do Space, ícone da sala, nome, descrição, duração, quantidade e convite |
| Grade central | Cards responsivos de participantes; 2–4 colunas conforme largura |
| Participante | Avatar grande, nome, presença, microfone, atividade e destaque de fala |
| Atividade lateral | Opcional: entradas recentes e mensagens leves; fecha em telas menores |
| Dock de chamada | Microfone, áudio, compartilhar, mais e sair. Sempre acessível |

### 5.2 Estado "falando"

- Borda externa de 2 px com `--space-accent`.
- Glow suave com opacidade máxima de 24 %.
- Waveform curta ou indicador de voz, sem movimento excessivo.
- Nome e texto "Falando agora" reforçam o estado.
- Debounce para evitar cintilação entre pacotes de áudio.

### 5.3 Comportamentos

- Entrar mostra "Conectando…" e só troca para conectado após confirmação real.
- Sair é sempre imediato localmente e finaliza recursos de áudio.
- Mute/deafen refletem estado local e remoto.
- Permissão de microfone negada → explicação + caminho de correção.
- Reconexão preserva a sala e exibe status sem duplicar participantes.

### 5.4 Capacidade e grade

| Participantes | Composição |
|---|---|
| 1 | Card em destaque sem ampliar avatar além do necessário |
| 2–4 | Grade 2 × 2 ou linha equilibrada |
| 5–9 | Grade 3 × 2 ou 3 × 3; reduzir detalhes secundários |
| 10+ | Grade adaptativa com scroll interno; preservar dock e cabeçalho |

### 5.5 Casos de borda

- Sem avatar: iniciais + cor estável por ID.
- Compartilhamento de tela: pessoas migram para faixa lateral/inferior.
- Usuário removido: sai da grade com feedback discreto, sem erro global.
- Mudança de dispositivo de áudio: chamada permanece ativa quando possível.
- Falha de mídia: diferenciar erro local, indisponibilidade e perda de conexão.

---

## 6. Conversa (normativa B)

> **Correção do mockup:** onde aparece "Canais de voz" e "Canais de texto", implementar "Salas do Space" ou agrupamentos por atividade. Não replicar a terminologia do Discord.

### 6.1 Estrutura

| Parte | Especificação |
|---|---|
| Cabeçalho | Ícone, nome, descrição, avatares, presença, busca e menu |
| Histórico | Coluna confortável; mensagens agrupadas por autor e proximidade |
| Mensagem | Avatar, autor, hora, conteúdo, mídia, reação, reply, menu contextual |
| Divisor | "Novas mensagens" com contraste e destino acessível |
| Composer | Anexo, emoji, áudio, campo expansível e enviar numa única superfície |

### 6.2 Regras de mensagem

- Agrupar mensagens consecutivas do mesmo autor dentro de 5 minutos, salvo reply, mídia ou mudança de estado.
- Enter envia; Shift+Enter quebra linha. Preferência configurável.
- Hover revela ações sem fazer o conteúdo saltar.
- Imagens: preview, dimensões máximas, estado de upload, retry, texto alternativo.
- Reações: contagem + estado selecionado; nunca depender só de cor.
- Mensagens próprias: enviando, enviada, falhou, reenviar.

### 6.3 Scroll e mensagens novas

- Auto-scroll somente se o usuário estiver próximo do final.
- Se estiver lendo conteúdo antigo → botão "novas mensagens" com contagem.
- Carregar mensagens anteriores → preservar posição visual.
- Foco após enviar retorna ao composer.

---

## 7. Visão geral e descoberta

### 7.1 Página inicial do Space

- Boas-vindas + descrição curta do propósito do Space.
- **Acontecendo agora**: 2–4 cards grandes com contexto e CTA.
- **Atividade recente**: eventos úteis, não log técnico.
- **Pessoas online**: resumo; diretório completo fica em "Pessoas".
- Estado vazio orienta a primeira ação: criar sala, convidar ou iniciar conversa.

### 7.2 Card de sala

| Campo | Obrigatório | Regra |
|---|---|---|
| Ícone e nome | sim | Identificam atividade sem usar `#` |
| Descrição | sim | Uma linha orientada ao uso |
| Pessoas | quando ativo | Avatares empilhados + texto contextual |
| Estado | sim | Ao vivo, vazia, agendada ou com mensagens novas |
| CTA | sim | Entrar, abrir conversa ou participar |
| Imagem ambiente | opcional | Não pode comprometer leitura nem virar ruído |

### 7.3 Diretório de pessoas

- Busca por nome + filtros online/offline/função.
- Clique abre popover com identidade, atividade, funções e ações permitidas.
- Permissões administrativas ficam escondidas para usuários sem autorização.
- Lista virtualizada quando houver muitos participantes.

---

## 8. Feedback, estados e acessibilidade

| Estado | Resposta visual/comportamental |
|---|---|
| Loading | Skeleton que preserva o layout; evitar spinner central em tela vazia |
| Vazio | Explicar o estado e oferecer uma ação útil |
| Erro recuperável | Mensagem local + tentar novamente; preservar dados digitados |
| Offline | Banner discreto; composer bloqueado ou em fila conforme suporte |
| Reconectando | Status persistente; nunca limpar Space ou sala selecionados |
| Sem permissão | Explicação específica; ocultar ações impossíveis quando adequado |
| Sucesso | Feedback próximo à ação; toast para resultado global |
| Destrutivo | Confirmação somente quando o dano não é facilmente reversível |

### 8.1 Teclado e leitores de tela

- Ordem de foco acompanha a ordem visual.
- Focus ring de 2 px com offset 2 px.
- Escape fecha overlay superior; foco retorna ao acionador.
- Modais prendem foco e têm título/descrição programáticos.
- Atalhos não substituem controles visíveis.
- Mudanças de conexão usam `aria-live` sem anunciar cada pacote.

### 8.2 Movimento

| Interação | Duração | Curva |
|---|---|---|
| Hover/focus | 100–140 ms | ease-out |
| Popover/menu | 140–180 ms | ease-out |
| Drawer/modal | 180–240 ms | cubic-bezier(.2,.8,.2,1) |
| Speaking pulse | 600–900 ms | suave e contínua |

Com `prefers-reduced-motion: reduce`, remover pulsos, parallax e deslocamentos; preservar mudanças instantâneas de estado.

---

## 9. Contratos técnicos

### 9.1 Tokens CSS mínimos

```css
:root {
  --vc-bg-canvas: #0d0f14;
  --vc-bg-rail: #111318;
  --vc-bg-panel: #15171d;
  --vc-surface-1: #191c23;
  --vc-surface-2: #20242d;
  --vc-border: #2a303a;
  --vc-text-strong: #f6f7f9;
  --vc-text: #d9dce3;
  --vc-text-muted: #8d95a3;
  --vc-positive: #32c48d;
  --vc-danger: #f0445e;
  --space-accent: #ff3f6c;
  --space-accent-soft: rgba(255, 63, 108, .14);
  --radius-input: 12px;
  --radius-card: 16px;
  --radius-modal: 20px;
  --focus-ring: 0 0 0 2px var(--vc-bg-canvas), 0 0 0 4px var(--space-accent);
}
```

### 9.2 Arquitetura de componentes sugerida

```
AppShell
├── GlobalRail
├── SpacePanel
│   ├── SpaceIdentity
│   ├── SpaceNavigation
│   ├── RoomList
│   └── SelfControls
└── MainRoute
    ├── SpaceOverview
    ├── ConversationRoom
    │   ├── ConversationHeader
    │   ├── MessageTimeline
    │   └── MessageComposer
    ├── VoiceRoom
    │   ├── ParticipantGrid
    │   ├── RoomActivityPanel
    │   └── CallControlDock
    └── PeopleDirectory
```

### 9.3 Fonte única de estado

- `selectedSpaceId` e `selectedRoomId` não podem ser limpos por eventos genéricos de reconexão.
- Eventos WebSocket atualizam entidades normalizadas; componentes não mantêm cópias divergentes.
- Estados otimistas precisam de ID temporário, confirmação e rollback.
- Presença expira por política explícita; não por remoção arbitrária na UI.
- O tema do Space é derivado de tokens validados, nunca de estilos inline espalhados.

---

## 10. Governança e qualidade

### 10.1 Definition of Done de componente

- Variantes e estados documentados.
- Teclado, foco e nome acessível validados.
- Tema claro/escuro somente se realmente suportado.
- Responsividade testada em 1440, 1280, 1024 e 800 px.
- Loading, vazio, erro e disabled implementados.
- Sem ação decorativa ou handler vazio.
- Sem cores ou medidas mágicas fora dos tokens.
- Teste de unidade/integração para comportamento crítico.

### 10.2 Proibições

| Não fazer | Motivo |
|---|---|
| Usar `#` para conversa | Reforça o modelo mental de canal do Discord |
| Fixar lista de pessoas sempre visível | Rouba largura e transforma presença em administração |
| Colorir grandes áreas com o acento | Compromete hierarquia e personalização |
| Criar botão sem função | Produz protótipo enganoso |
| Encerrar após o build | Build não valida UX, tempo real nem fluxo |
| Alterar backend com mocks silenciosos | Mascara ausência de contrato real |
| Misturar bibliotecas de ícones | Quebra consistência e alinhamento |

### 10.3 Métricas de qualidade

- Tempo para entrar em uma sala já conhecida: até 2 ações após selecionar o Space.
- Estado de conexão sempre visível e compreensível.
- Nenhum layout overflow horizontal nas larguras suportadas.
- Nenhum erro importante no console durante o fluxo principal.
- Mudanças em tempo real não expulsam o usuário do contexto atual.

---

## 11. Plano de implementação

| Fase | Escopo | Saída verificável |
|---|---|---|
| 1. Fundamentos | Tokens, ícones, AppShell e navegação | Layout responsivo sem regressão funcional |
| 2. Visão geral | Cards, atividade, pessoas e vazios | Space útil sem grandes áreas mortas |
| 3. Conversa | Timeline, composer, mídia, reactions e scroll | Enviar/receber/reconectar de ponta a ponta |
| 4. Voz | Grade, estados, dock, permissão e reconexão | Entrar/falar/mutar/sair corretamente |
| 5. Pessoas | Diretório, popover, presença e ações | Busca e perfil resumido funcionais |
| 6. Polimento | A11y, movimento, erros e performance | Checklist e testes completos |

### 11.1 Estratégia de migração

- Inventariar componentes, rotas, stores, eventos e endpoints atuais.
- Marcar o que pode ser reutilizado sem carregar a arquitetura visual antiga.
- Implementar tokens e shell antes de páginas isoladas.
- Migrar um fluxo vertical por vez, mantendo integração real.
- Remover componentes antigos somente após equivalência funcional.
- Validar visualmente e executar build, lint e testes ao final de cada fase.

**Ordem obrigatória:** não começar por microanimações ou modal de criação enquanto visão geral, conversa e voz ainda estiverem incompletas.

---

## 12. Prompt operacional

Cole o texto abaixo junto deste documento e das duas imagens de referência:

> Use o documento "VoiceCraft Design System v1.0" como especificação normativa da interface. As imagens anexas são referências A (voz) e B (chat).
>
> Antes de editar, audite o repositório: frontend, backend, rotas, stores, modelos, eventos WebSocket e testes. Apresente apenas um resumo curto da auditoria e comece a implementação.
>
> Implemente por fluxo vertical, na ordem do capítulo 11. Nesta execução, conclua uma fase funcional inteira; não distribua o esforço em polimentos superficiais. Preserve contratos corretos, mas substitua a arquitetura visual antiga.
>
> **Regras inegociáveis:**
> 1. Space continua sendo Space; canais tornam-se salas. Não use `#` como identidade.
> 2. A imagem B define chats: cabeçalho, timeline, mensagens agrupadas, mídia e composer integrado.
> 3. A imagem A define voz: pessoas em cards, estado de fala e dock de controle.
> 4. Botões principais precisam de handlers reais. Não usar mocks para ocultar backend ausente.
> 5. Reconexão não pode limpar Space ou sala selecionados.
> 6. Use tokens; não espalhe cores e medidas mágicas.
> 7. Implemente loading, vazio, erro, disabled e responsividade.
> 8. Não declare conclusão somente porque o build passou.
>
> Ao concluir, informe: fase entregue, arquivos alterados, fluxos executados manualmente, comandos de validação, evidências visuais e limitações reais. Se encontrar uma decisão não coberta, escolha a opção mais coerente com os cinco princípios do capítulo 1 e registre a decisão.

### Checklist final

- O resultado parece VoiceCraft, não Discord recolorido.
- O fluxo funciona com dados reais.
- A tela principal usa bem o espaço.
- Chat segue a referência B.
- Voz segue a referência A.
- Estados e reconexão foram testados.
- Build, lint e testes disponíveis passaram.
