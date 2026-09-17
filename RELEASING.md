# Releases do Voice

Guia curto. Processo completo (estilo Lumen): `[docs/RELEASE_PROCESS.md](docs/RELEASE_PROCESS.md)`.

## SemVer


| Bump     | Comando             | Exemplo           |
| -------- | ------------------- | ----------------- |
| bugfix   | `npm version patch` | `1.0.0` → `1.0.1` |
| feature  | `npm version minor` | `1.0.0` → `1.1.0` |
| breaking | `npm version major` | `1.0.0` → `2.0.0` |


## Publicar

```bash
npm version patch   # ou minor / majorpr
git push && git push --tags
```

Tag `v*` → GitHub Actions → instalador + `latest.yml` em
[Releases](https://github.com/NowardEthan/voicecraft/releases).

Auto-update só no **app instalado** (mini notificação + Configurações).