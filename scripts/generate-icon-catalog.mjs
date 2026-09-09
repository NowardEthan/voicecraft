/**
 * generate-icon-catalog.mjs
 *
 * One-shot script that reads the installed @iconify-json/ph collection,
 * picks a curated list of base icons (name + label + keywords + categories),
 * and emits a static catalog module at `src/utils/spaceIcons.generated.js`.
 *
 * Run once after editing the BASE_ICONS list:
 *   node scripts/generate-icon-catalog.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const iconsPath = path.join(root, 'node_modules', '@iconify-json', 'ph', 'icons.json')
const outPath = path.join(root, 'src', 'utils', 'spaceIcons.generated.js')

// ----- Curated base list (icon name + label PT + keywords PT/EN + categories) -----
// Each entry produces 4 style variants: outline (regular), rounded (light),
// filled (fill), duotone (duotone).
const BASE_ICONS = [
  // Comunidade
  { name: 'users-three', label: 'Grupo', keywords: ['comunidade','grupo','pessoas','amigos','community','group','people','friends','team','equipe'], categories: ['community'] },
  { name: 'users', label: 'Pessoas', keywords: ['pessoas','usuarios','people','users','members','membros','pessoal'], categories: ['community'] },
  { name: 'user-circle', label: 'Pessoa', keywords: ['pessoa','usuario','perfil','person','user','profile','account','conta'], categories: ['community'] },
  { name: 'user-circle-gear', label: 'Configurar pessoa', keywords: ['configurar','pessoa','settings','profile','account'], categories: ['community','settings'] },
  { name: 'crown', label: 'Criador', keywords: ['coroa','criador','dono','admin','owner','creator','crown','king','rei'], categories: ['community','roles'] },
  { name: 'handshake', label: 'Acordo', keywords: ['acordo','parceria','acordo','handshake','deal','partnership','welcome','bemvindo'], categories: ['community'] },
  { name: 'megaphone', label: 'Avisos', keywords: ['aviso','anuncio','megafone','announcement','notice','broadcast','megaphone','loudspeaker'], categories: ['community','events'] },
  { name: 'flag', label: 'Sinalizar', keywords: ['bandeira','sinalizar','reportar','flag','report','mark','signal'], categories: ['community'] },

  // Voz
  { name: 'microphone', label: 'Microfone', keywords: ['microfone','mic','voz','falar','microphone','mic','voice','talk','speak','record'], categories: ['voice'] },
  { name: 'microphone-stage', label: 'Palco', keywords: ['palco','microfone','stage','podium','presenter'], categories: ['voice','events'] },
  { name: 'microphone-slash', label: 'Mudo', keywords: ['mudo','microfone','mute','mic off','silence'], categories: ['voice'] },
  { name: 'broadcast', label: 'Broadcast', keywords: ['transmissao','broadcast','radio','stream','live','aovivo'], categories: ['voice'] },
  { name: 'radio', label: 'Rádio', keywords: ['radio','podcast','stream','fm'], categories: ['voice'] },
  { name: 'headphones', label: 'Fones', keywords: ['fones','ouvido','headphones','earphones','music','musica','audio','listen','escutar'], categories: ['voice','music'] },
  { name: 'speaker-high', label: 'Alto-falante', keywords: ['altofalante','som','volume','speaker','sound','volume','loud','audio'], categories: ['voice','music'] },
  { name: 'waveform', label: 'Onda de áudio', keywords: ['onda','audio','wave','waveform','spectrum','vocal'], categories: ['voice','music'] },

  // Trabalho
  { name: 'briefcase', label: 'Trabalho', keywords: ['trabalho','maleta','job','work','briefcase','business','career','carreira'], categories: ['work'] },
  { name: 'buildings', label: 'Empresa', keywords: ['empresa','predio','building','company','office','escritorio','corporate','corporativo'], categories: ['work'] },
  { name: 'book-open-text', label: 'Documento', keywords: ['documento','arquivo','document','file','text','paper','papel'], categories: ['work','study'] },
  { name: 'calendar', label: 'Agenda', keywords: ['agenda','calendario','calendar','schedule','date','data','event'], categories: ['work','events'] },
  { name: 'clock', label: 'Horário', keywords: ['horario','relogio','clock','time','schedule','watch'], categories: ['work','events'] },
  { name: 'presentation-chart', label: 'Apresentação', keywords: ['apresentacao','slide','presentation','chart','slide','deck','palestra'], categories: ['work'] },
  { name: 'pen-nib', label: 'Editar', keywords: ['editar','caneta','escrever','edit','pen','write','author'], categories: ['work','study','art'] },
  { name: 'laptop', label: 'Notebook', keywords: ['notebook','laptop','computador','computer','pc','workstation'], categories: ['work','tech'] },

  // Lazer
  { name: 'game-controller', label: 'Videogame', keywords: ['videogame','controle','jogo','gamepad','gaming','controller','console','play'], categories: ['leisure','games'] },
  { name: 'joystick', label: 'Joystick', keywords: ['joystick','controle','jogo','controller','arcade','game'], categories: ['leisure','games'] },
  { name: 'dice-five', label: 'Dado', keywords: ['dado','jogo','dice','game','roll','rpg','tabletop'], categories: ['leisure','games'] },
  { name: 'puzzle-piece', label: 'Quebra-cabeça', keywords: ['quebracabeca','puzzle','jogo','enigma','logic','riddle'], categories: ['leisure','games'] },
  { name: 'trophy', label: 'Troféu', keywords: ['trofeu','premio','conquista','trophy','award','prize','winner'], categories: ['leisure','games'] },
  { name: 'medal', label: 'Medalha', keywords: ['medalha','conquista','medal','achievement','award','badge'], categories: ['leisure','games'] },
  { name: 'star', label: 'Favorito', keywords: ['estrela','favorito','star','favorite','bookmark','rate','avaliar'], categories: ['leisure'] },
  { name: 'heart', label: 'Coração', keywords: ['coracao','amor','heart','love','like','favorite'], categories: ['leisure'] },

  // Jogos
  { name: 'sword', label: 'Espada', keywords: ['espada','luta','sword','fight','battle','rpg','medieval','weapon','arma'], categories: ['games'] },
  { name: 'shield', label: 'Escudo', keywords: ['escudo','defesa','shield','defense','protection','security','armor'], categories: ['games','tech'] },
  { name: 'skull', label: 'Caveira', keywords: ['caveira','skull','death','morte','horror','terror','danger','halloween'], categories: ['games'] },
  { name: 'crown-simple', label: 'Coroa', keywords: ['coroa','rei','crown','king','queen','rainha','royal','rpg'], categories: ['games','community'] },
  { name: 'fire', label: 'Fogo', keywords: ['fogo','chama','fire','flame','hot','quente','burn'], categories: ['games','nature'] },
  { name: 'lightning', label: 'Raio', keywords: ['raio','relampago','lightning','thunder','electric','eletricidade','shock','choque'], categories: ['games','tech'] },
  { name: 'magic-wand', label: 'Magia', keywords: ['magia','varinha','magic','wand','spell','rpg','fantasy'], categories: ['games','art'] },
  { name: 'target', label: 'Alvo', keywords: ['alvo','target','goal','objetivo','bullseye','scope','aim'], categories: ['games','work'] },
  { name: 'chess-knight', label: 'Xadrez', keywords: ['xadrez','cavalo','chess','knight','board','tabuleiro','strategy','estrategia'], categories: ['games'] },
  { name: 'cards', label: 'Cartas', keywords: ['cartas','baralho','cards','poker','deck','magic','tcg'], categories: ['games'] },

  // Música
  { name: 'music-notes', label: 'Notas', keywords: ['notas','musica','notes','music','song','melody','melodia'], categories: ['music'] },
  { name: 'music-note', label: 'Nota', keywords: ['nota','musica','note','music','single','tone'], categories: ['music'] },
  { name: 'guitar', label: 'Violão', keywords: ['violao','guitarra','guitar','acoustic','instrument'], categories: ['music'] },
  { name: 'piano-keys', label: 'Piano', keywords: ['piano','teclas','keys','instrument','keyboard'], categories: ['music'] },
  { name: 'microphone-lines', label: 'Estúdio', keywords: ['microfone','estudio','studio','podcast','mic','recording'], categories: ['music','voice'] },
  { name: 'play', label: 'Tocar', keywords: ['tocar','play','iniciar','start','begin','run'], categories: ['music','leisure'] },
  { name: 'pause', label: 'Pausar', keywords: ['pausar','pause','parar','stop'], categories: ['music','leisure'] },
  { name: 'skip-forward', label: 'Próximo', keywords: ['proximo','avancar','next','forward','skip'], categories: ['music','leisure'] },
  { name: 'shuffle', label: 'Aleatório', keywords: ['aleatorio','embaralhar','shuffle','random','mix'], categories: ['music','leisure'] },
  { name: 'vinyl-record', label: 'Vinil', keywords: ['vinil','disco','vinyl','record','music','retro','analog'], categories: ['music'] },

  // Estudos
  { name: 'book-open', label: 'Livro', keywords: ['livro','estudar','book','read','study','learn','educacao'], categories: ['study'] },
  { name: 'graduation-cap', label: 'Formatura', keywords: ['formatura','graduacao','graduation','cap','diploma','student','aluno','college','universitario'], categories: ['study'] },
  { name: 'notebook', label: 'Caderno', keywords: ['caderno','notas','notebook','notes','paper','journal','diario'], categories: ['study'] },
  { name: 'pencil-line', label: 'Lápis', keywords: ['lapis','escrever','pencil','write','draft','sketch','rascunho'], categories: ['study','art'] },
  { name: 'ruler', label: 'Régua', keywords: ['regua','ruler','measure','medir','escala','scale'], categories: ['study','work'] },
  { name: 'flask', label: 'Laboratório', keywords: ['laboratorio','quimica','flask','lab','chemistry','science','ciencia','experiment'], categories: ['study','tech'] },
  { name: 'microscope', label: 'Microscópio', keywords: ['microscopio','microscope','lab','science','ciencia','research','pesquisa'], categories: ['study','tech'] },
  { name: 'calculator', label: 'Calculadora', keywords: ['calculadora','calculator','math','matematica','compute'], categories: ['study','work'] },
  { name: 'chalkboard-teacher', label: 'Professor', keywords: ['professor','ensinar','teacher','chalkboard','classroom','aula','school','escola'], categories: ['study'] },
  { name: 'atom', label: 'Átomo', keywords: ['atomo','ciencia','atom','science','physics','fisica','molecule'], categories: ['study'] },

  // Tecnologia
  { name: 'cpu', label: 'Processador', keywords: ['processador','cpu','chip','hardware','processor','compute'], categories: ['tech'] },
  { name: 'code', label: 'Código', keywords: ['codigo','programar','code','programming','dev','developer','software','script'], categories: ['tech'] },
  { name: 'terminal-window', label: 'Terminal', keywords: ['terminal','console','shell','command','cmd','cli','bash'], categories: ['tech'] },
  { name: 'database', label: 'Banco de dados', keywords: ['banco','dados','database','data','sql','storage','db'], categories: ['tech'] },
  { name: 'cloud', label: 'Nuvem', keywords: ['nuvem','cloud','server','servidor','aws','azure','gcp','online'], categories: ['tech'] },
  { name: 'cloud-check', label: 'Sincronizado', keywords: ['nuvem','sincronizado','cloud','synced','check','ok'], categories: ['tech'] },
  { name: 'wifi-high', label: 'Wi-Fi', keywords: ['wifi','internet','wireless','signal','connection','conexao'], categories: ['tech'] },
  { name: 'hard-drives', label: 'Servidor', keywords: ['servidor','disco','server','hard','drive','storage','raid'], categories: ['tech'] },
  { name: 'shield-check', label: 'Segurança', keywords: ['seguranca','escudo','security','shield','safe','protected','check','verify'], categories: ['tech','community'] },
  { name: 'bug', label: 'Bug', keywords: ['bug','inseto','erro','error','issue','defeito','debug'], categories: ['tech'] },

  // Arte e criatividade
  { name: 'paint-brush', label: 'Pintar', keywords: ['pintar','pincel','paint','brush','art','arte','draw','desenhar'], categories: ['art'] },
  { name: 'palette', label: 'Paleta', keywords: ['paleta','cores','palette','color','paint','art','arte','design'], categories: ['art'] },
  { name: 'pen-nib', label: 'Caneta', keywords: ['caneta','nib','pen','write','escrever','art','caligrafia'], categories: ['art','work'] },
  { name: 'highlighter', label: 'Marca-texto', keywords: ['marcatexto','highlighter','highlight','marca','destacar'], categories: ['art','study'] },
  { name: 'selection', label: 'Selecionar', keywords: ['selecionar','marcador','selection','marquee','select','lasso'], categories: ['art','tech'] },
  { name: 'shapes', label: 'Formas', keywords: ['formas','shapes','geometric','geometricas','square','circle','triangle'], categories: ['art'] },
  { name: 'path', label: 'Caminho', keywords: ['caminho','path','vector','vetor','bezier','curve','curva'], categories: ['art','tech'] },
  { name: 'film-frame', label: 'Cinema', keywords: ['cinema','filme','film','movie','video','cinematography'], categories: ['art'] },
  { name: 'camera', label: 'Câmera', keywords: ['camera','foto','photo','photography','fotografia','snapshot','capture'], categories: ['art','events'] },
  { name: 'video-camera', label: 'Vídeo', keywords: ['video','camera','film','record','gravar','movie'], categories: ['art','events'] },

  // Casa e família
  { name: 'house', label: 'Casa', keywords: ['casa','lar','house','home','residence','residency','family','familia'], categories: ['home'] },
  { name: 'house-line', label: 'Residência', keywords: ['residencia','casa','house','home','building','residence'], categories: ['home'] },
  { name: 'baby', label: 'Bebê', keywords: ['bebe','crianca','baby','infant','child','kid'], categories: ['home'] },
  { name: 'users-four', label: 'Família', keywords: ['familia','family','parents','pais','kids','criancas','relatives'], categories: ['home','community'] },
  { name: 'heart-fill', label: 'Família', keywords: ['familia','coracao','family','heart','love','amor'], categories: ['home','community'] },
  { name: 'dog', label: 'Cachorro', keywords: ['cachorro','pet','dog','animal','cao','puppy'], categories: ['home','nature'] },
  { name: 'cat', label: 'Gato', keywords: ['gato','pet','cat','animal','gato','kitten'], categories: ['home','nature'] },
  { name: 'cooking-pot', label: 'Cozinha', keywords: ['cozinha','panela','cooking','kitchen','pot','cozinhar','recipe','receita'], categories: ['home'] },
  { name: 'couch', label: 'Sofá', keywords: ['sofa','couch','sofa','living','room','sala','lounge','descanso'], categories: ['home'] },
  { name: 'bed', label: 'Quarto', keywords: ['quarto','cama','bed','bedroom','sleep','dormir','descanso'], categories: ['home'] },

  // Esportes
  { name: 'soccer-ball', label: 'Futebol', keywords: ['futebol','bola','soccer','football','ball','sport','esporte'], categories: ['sports'] },
  { name: 'basketball', label: 'Basquete', keywords: ['basquete','bola','basketball','ball','sport','esporte','nba'], categories: ['sports'] },
  { name: 'tennis-ball', label: 'Tênis', keywords: ['tenis','bola','tennis','ball','sport','esporte','raquete'], categories: ['sports'] },
  { name: 'barbell', label: 'Academia', keywords: ['academia','pesos','gym','weight','barbell','dumbbell','muscle','musculacao'], categories: ['sports','health'] },
  { name: 'bicycle', label: 'Bike', keywords: ['bike','bicicleta','bicycle','cycle','cycling','pedal'], categories: ['sports','nature'] },
  { name: 'person-simple-run', label: 'Corrida', keywords: ['corrida','run','runner','jogging','sport','run','correndo'], categories: ['sports','health'] },
  { name: 'mountains', label: 'Montanha', keywords: ['montanha','trilha','mountain','hike','hiking','climb','alpinismo','nature'], categories: ['sports','nature'] },
  { name: 'compass', label: 'Bússola', keywords: ['bussola','compass','direcao','direction','navigate','navegacao','explore'], categories: ['sports','travel','nature'] },
  { name: 'swimming-pool', label: 'Piscina', keywords: ['piscina','natacao','pool','swimming','swim','nado'], categories: ['sports'] },
  { name: 'medal-military', label: 'Conquista', keywords: ['conquista','medalha','medal','achievement','badge','award','militar'], categories: ['sports','leisure'] },

  // Natureza
  { name: 'tree', label: 'Árvore', keywords: ['arvore','tree','plant','planta','nature','natureza','forest','floresta'], categories: ['nature'] },
  { name: 'tree-evergreen', label: 'Pinheiro', keywords: ['pinheiro','arvore','evergreen','pine','tree','conifera','nature'], categories: ['nature'] },
  { name: 'leaf', label: 'Folha', keywords: ['folha','leaf','plant','planta','nature','natureza','green','verde'], categories: ['nature'] },
  { name: 'flower', label: 'Flor', keywords: ['flor','flower','plant','planta','nature','natureza','bloom','botanical'], categories: ['nature'] },
  { name: 'sun', label: 'Sol', keywords: ['sol','sun','sunny','ensolarado','bright','claro','day','dia','summer','verao'], categories: ['nature'] },
  { name: 'moon', label: 'Lua', keywords: ['lua','moon','lunar','night','noite','crescent','cheia'], categories: ['nature'] },
  { name: 'cloud-rain', label: 'Chuva', keywords: ['chuva','nuvem','rain','cloud','storm','tempestade','weather','tempo'], categories: ['nature'] },
  { name: 'lightning-slash', label: 'Tempestade', keywords: ['tempestade','raio','storm','thunder','lightning','weather'], categories: ['nature'] },
  { name: 'snowflake', label: 'Neve', keywords: ['neve','snow','snowflake','winter','inverno','cold','frio','ice','gelo'], categories: ['nature'] },
  { name: 'drop', label: 'Gota', keywords: ['gota','agua','drop','water','liquid','liquido','rain'], categories: ['nature'] },
  { name: 'mountains', label: 'Montanha', keywords: ['montanha','mountain','peak','pico','nature','hike','trilha'], categories: ['nature','sports'] },
  { name: 'plant', label: 'Planta', keywords: ['planta','plant','folha','leaf','nature','verde','green'], categories: ['nature','home'] },

  // Viagem
  { name: 'airplane-tilt', label: 'Avião', keywords: ['aviao','voo','airplane','plane','flight','fly','travel','viagem'], categories: ['travel'] },
  { name: 'airplane-takeoff', label: 'Decolagem', keywords: ['decolagem','aviao','takeoff','airplane','plane','flight','viagem'], categories: ['travel'] },
  { name: 'car-profile', label: 'Carro', keywords: ['carro','car','drive','dirigir','vehicle','veiculo','auto'], categories: ['travel'] },
  { name: 'train', label: 'Trem', keywords: ['trem','train','railway','railroad','locomotive','metro','subway'], categories: ['travel'] },
  { name: 'boat', label: 'Barco', keywords: ['barco','boat','ship','navio','sail','navegar','sea','mar'], categories: ['travel','nature'] },
  { name: 'globe-hemisphere-east', label: 'Mundo', keywords: ['mundo','globo','globe','world','earth','terra','planet','planeta'], categories: ['travel','symbols'] },
  { name: 'map-pin', label: 'Mapa', keywords: ['mapa','localizacao','pin','map','location','place','lugar','marker'], categories: ['travel','nature'] },
  { name: 'compass-tool', label: 'Direção', keywords: ['direcao','bussola','direction','compass','navigate','orientacao'], categories: ['travel','sports'] },
  { name: 'suitcase', label: 'Mala', keywords: ['mala','viagem','suitcase','luggage','baggage','travel','trip'], categories: ['travel'] },
  { name: 'passport', label: 'Passaporte', keywords: ['passaporte','documento','passport','document','travel','id','identity'], categories: ['travel','work'] },

  // Comida
  { name: 'pizza', label: 'Pizza', keywords: ['pizza','food','comida','italian','italiana','slice'], categories: ['food'] },
  { name: 'hamburger', label: 'Hambúrguer', keywords: ['hamburguer','burger','lanche','food','comida','snack','fastfood'], categories: ['food'] },
  { name: 'coffee', label: 'Café', keywords: ['cafe','coffee','bebida','drink','cafeina','espresso','cappuccino'], categories: ['food','home'] },
  { name: 'beer-stein', label: 'Cerveja', keywords: ['cerveja','beer','drink','bebida','bar','alcoolica','pub'], categories: ['food','leisure'] },
  { name: 'wine', label: 'Vinho', keywords: ['vinho','wine','drink','bebida','tinto','branco','rose','vinha'], categories: ['food','leisure'] },
  { name: 'cake', label: 'Bolo', keywords: ['bolo','cake','doce','sobremesa','dessert','festa','party','aniversario'], categories: ['food','events'] },
  { name: 'ice-cream', label: 'Sorvete', keywords: ['sorvete','icecream','doce','sobremesa','gelado','frio','dessert'], categories: ['food'] },
  { name: 'bowl-food', label: 'Tigela', keywords: ['tigela','comida','bowl','food','sopa','soup','ramen','acai','comida'], categories: ['food'] },
  { name: 'fork-knife', label: 'Restaurante', keywords: ['restaurante','garfo','faca','fork','knife','restaurant','food','meal','refeicao'], categories: ['food'] },
  { name: 'cookie', label: 'Biscoito', keywords: ['biscoito','cookie','doce','sobremesa','snack','lanche'], categories: ['food'] },

  // Eventos
  { name: 'confetti', label: 'Festa', keywords: ['festa','confete','confetti','party','celebration','celebracao'], categories: ['events'] },
  { name: 'balloon', label: 'Balão', keywords: ['balao','balloon','festa','party','birthday','aniversario','event'], categories: ['events'] },
  { name: 'gift', label: 'Presente', keywords: ['presente','presente','gift','present','box','caixa','surpresa'], categories: ['events'] },
  { name: 'candle', label: 'Vela', keywords: ['vela','candle','luz','light','fire','aniversario','birthday'], categories: ['events','home'] },
  { name: 'calendar-check', label: 'Evento', keywords: ['evento','agenda','event','calendar','schedule','agendado','marcado'], categories: ['events'] },
  { name: 'ticket', label: 'Ingresso', keywords: ['ingresso','ticket','evento','event','show','concerto','pass'], categories: ['events'] },
  { name: 'popcorn', label: 'Cinema', keywords: ['cinema','pipoca','popcorn','movie','film','snack'], categories: ['events','food','art'] },
  { name: 'firework', label: 'Fogos', keywords: ['fogos','fogosdeartificio','firework','fireworks','celebration','festa'], categories: ['events'] },
  { name: 'mask-happy', label: 'Fantasia', keywords: ['fantasia','mascara','mask','costume','halloween','party','festa'], categories: ['events'] },
  { name: 'music-notes-plus', label: 'Show', keywords: ['show','concerto','concert','music','musica','evento'], categories: ['events','music'] },

  // Símbolos
  { name: 'heart', label: 'Coração', keywords: ['coracao','heart','love','amor','like','curtir','favorite'], categories: ['symbols'] },
  { name: 'star', label: 'Estrela', keywords: ['estrela','star','favorite','rating','avaliar','destaque'], categories: ['symbols'] },
  { name: 'lightning', label: 'Raio', keywords: ['raio','lightning','bolt','energia','energia','energy','power','velocidade','speed'], categories: ['symbols','tech'] },
  { name: 'fire', label: 'Fogo', keywords: ['fogo','fire','flame','chama','hot','quente','trending','viral'], categories: ['symbols'] },
  { name: 'crown', label: 'Premium', keywords: ['premium','coroa','crown','pro','vip','exclusive','exclusivo'], categories: ['symbols'] },
  { name: 'check-circle', label: 'Confirmar', keywords: ['confirmar','check','ok','yes','sim','done','feito','success'], categories: ['symbols'] },
  { name: 'x-circle', label: 'Erro', keywords: ['erro','cancelar','x','no','nao','error','cancel','close','remove'], categories: ['symbols'] },
  { name: 'warning-circle', label: 'Atenção', keywords: ['atencao','aviso','warning','caution','cuidado','alert','alerta'], categories: ['symbols'] },
  { name: 'question', label: 'Pergunta', keywords: ['pergunta','duvida','question','help','ajuda','faq'], categories: ['symbols'] },
  { name: 'info', label: 'Informação', keywords: ['informacao','info','about','sobre','detalhes','details'], categories: ['symbols'] },
  { name: 'lightbulb', label: 'Ideia', keywords: ['ideia','lampada','idea','lightbulb','suggestion','sugestao','insight'], categories: ['symbols'] },
  { name: 'key', label: 'Chave', keywords: ['chave','key','password','senha','unlock','desbloquear','access','acesso'], categories: ['symbols','tech'] },
  { name: 'lock-key', label: 'Bloqueado', keywords: ['bloqueado','trancado','lock','key','private','privado','secure'], categories: ['symbols','tech'] },
  { name: 'link', label: 'Link', keywords: ['link','url','hyperlink','conexao','connection','chain','corrente'], categories: ['symbols','tech'] },
  { name: 'globe', label: 'Global', keywords: ['global','mundo','globe','world','web','internet','public','publico'], categories: ['symbols','travel'] },
  { name: 'hash', label: 'Hashtag', keywords: ['hashtag','hash','tag','etiqueta','number','numero','channel','canal'], categories: ['symbols'] },
  { name: 'at', label: 'Menção', keywords: ['mencao','arroba','mention','at','tag','user','usuario'], categories: ['symbols','community'] },
  { name: 'bell', label: 'Notificação', keywords: ['notificacao','sino','bell','notification','alert','alerta','ping'], categories: ['symbols'] },
  { name: 'magnifying-glass', label: 'Buscar', keywords: ['buscar','lupa','search','find','encontrar','lookup','zoom'], categories: ['symbols'] },
  { name: 'gear', label: 'Configurações', keywords: ['configuracoes','engrenagem','settings','gear','preferences','config','setup'], categories: ['symbols','tech'] },
]

// ----- Generate style variants -----
const STYLES = ['outline', 'rounded', 'filled', 'duotone']
const STYLE_SUFFIX = {
  outline: '',        // regular weight
  rounded: '-light',  // thinner, more rounded
  filled: '-fill',
  duotone: '-duotone',
}
const STYLE_COLLECTION = 'ph'

// Verify each icon exists in the installed @iconify-json/ph
const installed = JSON.parse(fs.readFileSync(iconsPath, 'utf8')).icons
const available = new Set(Object.keys(installed))

const generated = []
const skipped = []
const seenNames = new Set()
const duplicatesDropped = []
for (const base of BASE_ICONS) {
  if (seenNames.has(base.name)) {
    // Same Phosphor `name` already curated under different label/categories.
    // Keep the FIRST occurrence to avoid showing the same icon multiple
    // times in the picker (e.g. "lightning" was in both games+tech and
    // symbols+tech, causing it to appear in every tech filter).
    duplicatesDropped.push({ name: base.name, label: base.label })
    continue
  }
  seenNames.add(base.name)
  for (const style of STYLES) {
    const suffix = STYLE_SUFFIX[style]
    const fullName = `${base.name}${suffix}`
    if (!available.has(fullName)) {
      skipped.push({ name: base.name, style, full: fullName })
      continue
    }
    generated.push({
      id: fullName,
      name: base.name,
      style,
      collection: STYLE_COLLECTION,
      label: base.label,
      keywords: base.keywords,
      categories: base.categories,
    })
  }
}

const header = `// AUTO-GENERATED — do not edit by hand.
// Regenerate with: node scripts/generate-icon-catalog.mjs
// Source: curated list in scripts/generate-icon-catalog.mjs
// Collection: @iconify-json/ph (Phosphor) — installed locally for offline use.

export const ICON_CATALOG = Object.freeze([
${generated.map(serialize).join(',\n')}
])

export const ICON_CATALOG_SKIPPED = Object.freeze([
${skipped.map(s => `  { name: ${JSON.stringify(s.name)}, style: ${JSON.stringify(s.style)} }`).join(',\n')}
])
`

function serialize(entry) {
  return `  Object.freeze({
    id: ${JSON.stringify(entry.id)},
    name: ${JSON.stringify(entry.name)},
    style: ${JSON.stringify(entry.style)},
    collection: ${JSON.stringify(entry.collection)},
    label: ${JSON.stringify(entry.label)},
    keywords: Object.freeze(${JSON.stringify(entry.keywords)}),
    categories: Object.freeze(${JSON.stringify(entry.categories)}),
  })`
}

fs.writeFileSync(outPath, header, 'utf8')
console.log(`Generated ${generated.length} icon variants. Skipped ${skipped.length} (missing from collection).`)
if (duplicatesDropped.length) {
  console.log(`Dropped ${duplicatesDropped.length} duplicate base names (keeping first occurrence):`)
  for (const d of duplicatesDropped) console.log(`  - ${d.name} ("${d.label}")`)
}
console.log(`Output: ${outPath}`)
