# VoiceCraft - P2P Voice & Video Chat

> Software desktop para chamadas de voz/vídeo privadas em rede local (LAN), sem servidor central. Perfeito para uso com Radmin/VNC para conexões remotas.

## ✨ Funcionalidades

- 🎙️ **Chamadas de voz P2P** - Conexão direta entre peers
- 📹 **Videochamadas** - Webcam opcional
- 🔒 **Privacidade total** - Sem servidor, sem intermediários
- 🌐 **Multi-plataforma** - Windows, Mac, Linux (via Electron)
- 🔌 **Radmin/VNC Ready** - Funciona através de túneis VPN

## 🚀 Como funciona

```
┌──────────────┐         ┌──────────────┐
│   User A     │◄───────►│   User B     │
│ 192.168.1.10 │  P2P    │ 192.168.1.20 │
└──────────────┘  WebRTC └──────────────┘

     ▲ Para conexões remotas, use Radmin/VNC
       para criar túnel VPN na rede local
```

## 📦 Instalação

```bash
# Clonar ou entrar no diretório
cd voicecraft

# Instalar dependências
npm install

# Desenvolvimento
npm run dev

# Build para produção (sem publicar release)
npm run electron:build

# Publicar release no GitHub (local; CI faz isso em tags v*)
npm run release
```

### Releases e auto-update

Diretrizes completas (SemVer, checklist, CI): [`docs/RELEASE_PROCESS.md`](docs/RELEASE_PROCESS.md)
(resumo: [`RELEASING.md`](RELEASING.md)).

Resumo:

```bash
npm version patch   # ou minor / major
git push && git push --tags
```

O workflow **Release** gera o NSIS e publica em
[GitHub Releases](https://github.com/NowardEthan/voicecraft/releases).
Apps instalados atualizam sozinhos (mini notificação + Configurações).

> Sem assinatura de código no Windows o SmartScreen pode avisar na primeira instalação — normal no início.

## 🎮 Uso

1. **Execute o app** em ambos os computadores
2. **Copie seu IP** (exibido na tela inicial)
3. **No outro computador**, clique em "Conectar a Peer"
4. **Cole o IP** do primeiro computador
5. **Conecte-se!** A chamada inicia automaticamente

### Para conexões remotas:
1. Configure Radmin Viewer ou VNC Viewer no computador cliente
2. Conecte ao computador host via Radmin/VNC
3. O computador host aparecerá como se estivesse na rede local
4. Use o VoiceCraft normalmente!

## 🛠️ Stack Tecnológica

- **Electron** - Desktop runtime
- **React 18** - Interface do usuário
- **Tailwind CSS** - Estilização (estilo Discord)
- **WebRTC (simple-peer)** - Conexão P2P
- **Vite** - Bundler e dev server

## 📁 Estrutura do Projeto

```
voicecraft/
├── electron/
│   ├── main.js       # Processo principal do Electron
│   └── preload.js    # Bridge seguro Electron ↔ Renderer
├── src/
│   ├── components/
│   │   ├── Sidebar.jsx       # Sidebar esquerda
│   │   ├── VoiceChannel.jsx  # Área de chamada
│   │   └── ConnectionModal.jsx
│   ├── hooks/
│   │   └── usePeerDiscovery.js
│   ├── utils/
│   │   └── webrtc.js
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── package.json
├── vite.config.js
├── tailwind.config.js
└── README.md
```

## ⚠️ Notas Importantes

### NAT e Firewall
- Em redes locais (mesmo router), a conexão é direta
- Radmin/VNC cria túnel que faz o PC remoto aparecer na LAN

### Limitações Atuais
- O signaling (troca inicial de chaves) é manual via Input
- Para auto-descoberta, é necessário servidor local ou BroadcastChannel

### Portas
- **STUN**: 19302 (Google)
- **WebRTC**: Usa portas efêmeras UDP/TCP

## 🔮 Roadmap

- [ ] Descoberta automática de peers na LAN
- [ ] Server de signaling local (opcional)
- [ ] TURN server para NAT traversal
- [ ] Compartilhamento de tela
- [ ] Transferência de arquivos
- [ ] Chat de texto
- [ ] Criptografia E2E

## 📝 Licença

MIT License - Use livremente!
