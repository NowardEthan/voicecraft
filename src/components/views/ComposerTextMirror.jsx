/**
 * ComposerTextMirror — defensive fallback component.
 *
 * Existe para resiliência contra cache de build antigo (HMR do Vite pode
 * segurar referência a este componente em uma sessão que ficou aberta
 * entre versões). É um mirror invisível que retorna null em builds atuais;
 * serve apenas para evitar ReferenceError em cache de navegador.
 *
 * Não é importado em nenhum lugar de src/ atual. Se algum dia for usado,
 * ele deve renderizar um espelho invisível do textarea para detectar
 * overflow de linha (auto-grow mais sofisticado). Por ora é stub.
 */
export default function ComposerTextMirror(props) {
  if (typeof window !== 'undefined') {
    // Log para diagnóstico, não bloqueia.
    // eslint-disable-next-line no-console
    console.warn('[ComposerTextMirror] mounted in defensive mode; please update consumer.')
  }
  return null
}
