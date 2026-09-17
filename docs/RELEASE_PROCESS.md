# Processo de Release — Voice

Documento adaptado do processo do Lumen (`docs/RELEASE_PROCESS.md`),
ajustado para o Voice (Electron + GitHub Actions + `electron-updater`).

Canal público: [GitHub Releases](https://github.com/NowardEthan/voicecraft/releases)  
Versão canônica: `package.json` → campo `version`  
Auto-update: lê `latest.yml` da release mais recente

---

## Pré-requisitos

1. **Código commitado e no remoto**
   - Working tree limpa
   - Push da branch que deve virar release (em geral `main`)

2. **CI de release**
   - Workflow: `.github/workflows/release.yml`
   - Dispara em tags `v*` (ex.: `v1.0.1`)
   - Usa `GITHUB_TOKEN` do Actions (não precisa de PAT no fluxo normal)

3. **Só se for publicar do PC (emergência)**
   - PAT classic com escopo `repo`
   - PowerShell: `$env:GH_TOKEN="ghp_..."`

---

## Versionamento semântico (SemVer)

Seguir [SemVer](https://semver.org/lang/pt-BR/): `MAJOR.MINOR.PATCH`

```bash
# Correção de bug          1.0.0 → 1.0.1
npm version patch

# Nova funcionalidade      1.0.0 → 1.1.0
npm version minor

# Mudança incompatível    1.0.0 → 2.0.0
npm version major
```

O `npm version …` faz três coisas:
- Atualiza a versão no `package.json`
- Cria um commit automático
- Cria a tag git `vX.Y.Z`

### Quando usar cada tipo

| Tipo | Use quando | Exemplos no Voice |
|------|------------|------------------------|
| **PATCH** | Bugfix, polish, performance, copy — sem feature nova | crash no rail, toast, fix de settings |
| **MINOR** | Feature nova **compatível** | Hub de Spaces, salas, update toast, painel novo |
| **MAJOR** | Quebra fluxo/dados/install de propósito | novo `appId`, schema incompatível, assinatura que força reinstall |

### Regras extras

- Versão **só sobe** — nunca republicar a mesma `version` / tag
- Tag = `v` + versão do `package.json` (`1.2.3` → `v1.2.3`)
- Notas de release em **pt-BR**, curtas, focadas no que o usuário ganha
- Não deletar releases antigas (alguém ainda pode estar nelas)

### Exemplos

```
1.0.0 → 1.0.1   patch — corrige loop no rail
1.0.1 → 1.1.0   minor — Hub de Spaces público
1.1.0 → 1.1.1   patch — mini notificação de update
1.1.1 → 2.0.0   major — novo appId / assinatura que quebra a cadeia de update
```

---

## Criando uma nova release

### Passo 1 — Escolher o bump

```bash
npm version patch   # ou minor / major
```

### Passo 2 — Enviar commit + tag

```bash
git push
git push --tags
```

### Passo 3 — CI builda e publica (recomendado)

1. Abra [Actions](https://github.com/NowardEthan/voicecraft/actions) → workflow **Release**
2. Espere ficar verde
3. Confira a [release](https://github.com/NowardEthan/voicecraft/releases): `.exe` + `latest.yml`
4. Edite a release e cole as novidades em pt-BR

### Passo 4 — (Alternativa) Publicar do PC

Só se o Actions estiver fora:

```powershell
$env:GH_TOKEN="ghp_..."
npm run release
```

Isso roda Vite + `electron-builder --publish always` e sobe os assets.

### Build local (teste, sem publicar)

```bash
npm run electron:build
```

Saída em `release/`:
- `Voice Setup X.Y.Z.exe` — instalador NSIS
- `latest.yml` — metadados do auto-update
- `*.blockmap` — updates diferenciais (quando gerado)

---

## Checklist pré-publish

- [ ] Smoke: login Google, criar/entrar Space, voz, settings
- [ ] `version` no `package.json` **maior** que a última release
- [ ] Tag bate com a version (`v` + mesmo número)
- [ ] Texto de novidades em pt-BR pronto
- [ ] (Ideal) testou update: app antigo → notificação → instalar → versão nova

---

## Testando atualizações

### Instalação inicial

1. Baixe o `.exe` da release
2. Instale e abra o Voice
3. Confira a versão em **Configurações → Atualizações**

### Atualização (auto-update)

1. Deixe instalada a versão `N`
2. Publique `N+1` (patch ou minor) via tag + CI
3. Abra o app `N` (instalado — **não** `npm run dev`)
4. Em ~8s deve aparecer a **mini notificação** (canto inferior direito)
5. Aguarde o download → **Reiniciar e instalar**
6. Confira a versão nova em Configurações

Também dá para forçar em **Configurações → Atualizações → Verificar atualizações**.

---

## Importante

- Auto-update **não funciona** em `npm run dev` / `electron:dev`
- Auto-update **só funciona** no app **instalado** (packaged)
- Sem `latest.yml` na release, o updater fica cego
- Sem assinatura de código, o SmartScreen do Windows pode avisar na 1ª install — esperado por enquanto

---

## Estrutura dos arquivos da release

Cada GitHub Release deve conter algo assim:

```
Voice Setup 1.0.0.exe
latest.yml
Voice Setup 1.0.0.exe.blockmap   # opcional / gerado pelo builder
```

Exemplo de `latest.yml`:

```yaml
version: 1.0.0
files:
  - url: Voice Setup 1.0.0.exe
    sha512: …
    size: …
path: Voice Setup 1.0.0.exe
sha512: …
releaseDate: 2026-09-09T00:00:00.000Z
```

---

## Troubleshooting

### App não detecta atualização

1. Está rodando o instalado (não o `npm run dev`)?
2. Versão instalada é **menor** que a da release?
3. A release tem `latest.yml`?
4. Repo/publish em `package.json` aponta para `NowardEthan/voicecraft`?

### CI falhou no publish

1. Tag começa com `v`? (`v1.0.1`)
2. Permissão `contents: write` no workflow?
3. Logs do job **Build & publish**

### `GH_TOKEN not set` (publish local)

```powershell
$env:GH_TOKEN="ghp_..."
```

### `Cannot find module electron-updater`

```bash
npm install
```

---

## Workflow recomendado (resumo)

```bash
# 1. Desenvolver / testar
npm run dev

# 2. Commitar
git add .
git commit -m "feat: descrição curta"
git push

# 3. Bump SemVer
npm version minor    # patch | minor | major

# 4. Enviar tag → CI publica
git push
git push --tags

# 5. Editar notas da release no GitHub
```

---

## Boas práticas

1. Testar localmente antes de publicar
2. Escolher o bump certo (patch / minor / major)
3. Escrever notas claras em pt-BR
4. Testar o caminho de update de uma versão anterior
5. Não apagar releases antigas
6. Não rebaixar número de versão

---

## Referência rápida

| Item | Onde |
|------|------|
| Versão | `package.json` → `version` |
| Publish | `package.json` → `build.publish` |
| Updater | `electron/main.js` (setupUpdater) |
| Mini notificação | `src/features/settings/components/UpdateToast.jsx` |
| Settings | Configurações → Atualizações |
| CI | `.github/workflows/release.yml` |
| Resumo curto | [`RELEASING.md`](../RELEASING.md) |
| Releases | https://github.com/NowardEthan/voicecraft/releases |
