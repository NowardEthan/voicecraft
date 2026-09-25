# Voice 0.6.7 — Ícone com bordas arredondadas

**Data de release:** 2026-09-25  
**Bump:** `0.6.6 → 0.6.7` (patch — só assets)

---

## 🎨 Mudança visual

O ícone do Voice era **quadradão**. Agora tem **bordas arredondadas** em todos os tamanhos.

- **Raio**: 18% (suave). Em 1024×1024 = ~185px de arredondamento. Equilibra entre "fofo" e "profissional".
- **Estilo**: Símbolo V branco sobre fundo Voice Blue (#0A66FF).
- **Tamanhos atualizados**: 16, 32, 48, 64, 128, 256, 512, 1024 (todos arredondados).
- **Arquivos regenerados**:
  - `public/icon.ico` (Windows multi-resolução)
  - `public/app-icon.png` (1024×1024)
  - `public/favicon.png` (32×32)
  - `public/brand/voice-icon-{16..256}.png` (kit de tamanhos)
  - `public/logo.png` **mantido transparente** (sem background) para uso em superfícies escuras (TitleBar, AuthBridge).

## ✅ Como ver

- **Menu Iniciar** do Windows: clique com botão direito no ícone do Voice → "Propriedades" → veja o ícone com as bordas arredondadas.
- **Aplicativos e Recursos** (Configurações → Aplicativos): o ícone deve aparecer com cantos arredondados.
- **Taskbar**: idem.
- **Janela** (se mostrar favicon): vai usar o novo `favicon.png` 32×32.

## 📌 Próximo passo (major)

A major release **1.0.0** vai:
- Renomear `appId: "com.voicecraft.app"` → `"com.voice.app"`.
- Renomear binário `VoiceCraft.exe` → `Voice.exe`.
- Migrar caminhos Firebase Storage de `voicecraft/` para `voice/`.
- Atualizar `productName` para `"Voice"` (agora pode, sem quebrar upgrade porque será major com reinstall forçado).

Quem estiver na 0.6.x vai precisar **desinstalar e reinstalar** a 1.0.0. Avisaremos via banner no app antes da major.
