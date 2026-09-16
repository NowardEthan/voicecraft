# Voice 0.6.2 — Patch mínimo para testar auto-update

**Data de release:** 2026-09-16  
**Bump:** `0.6.1 → 0.6.2` (patch — sem features, só para validar o pipeline de auto-update end-to-end)

---

## 🎯 Objetivo desta release

Esta é uma **release de teste do auto-update estilo Steam**. Não há mudança funcional — a única alteração é o bump de versão (`0.6.1 → 0.6.2`).

Use a 0.6.2 para validar o pipeline completo:
1. **App instalado na 0.5.0**: deve detectar 0.6.2 em ~6s, baixar, instalar silenciosamente, recarregar o renderer.
2. **App instalado na 0.6.0 quebrado**: instalar manualmente a 0.6.1, depois auto-update para 0.6.2.
3. **App já na 0.6.1**: deve detectar 0.6.2 e atualizar.

## ✅ O que confirmar

- [ ] Auto-update dispara `update-available` no boot (toast aparece).
- [ ] Download completa sem erro (`update-downloaded`).
- [ ] Instalador NSIS roda em `/S /norestart` em background (sem janela).
- [ ] Renderer recarrega (`did-finish-load`).
- [ ] Versão em **Configurações → Sobre** mostra `0.6.2`.
- [ ] Toast mostra "Atualizando para 0.6.2… sem fechar" durante o reload.
