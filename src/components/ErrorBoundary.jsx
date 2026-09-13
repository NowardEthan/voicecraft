import { Component } from 'react'

/**
 * ErrorBoundary — catches React render errors below it and shows a friendly
 * fallback instead of leaving the screen blank. Useful for surfacing bugs
 * that would otherwise be invisible (especially when the broken component
 * is the main view).
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    this.setState({ error, info })
    // Log to console for the DevTools console
    console.error('[ErrorBoundary] caught:', error, info)
  }

  handleReset = () => {
    this.setState({ error: null, info: null })
    if (this.props.onReset) this.props.onReset()
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex items-center justify-center p-8 bg-black h-full min-h-0">
          <div className="max-w-md w-full rounded-2xl border border-danger/30 bg-danger/10 p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-danger/20 flex items-center justify-center flex-shrink-0">
                <span className="text-danger text-lg">!</span>
              </div>
              <div>
                <h2 className="text-[16px] font-semibold text-strong mb-1">
                  Algo deu errado
                </h2>
                <p className="text-[12px] text-muted">
                  Um erro impediu a tela de renderizar. Detalhes abaixo.
                </p>
              </div>
            </div>
            <pre className="text-[11px] font-mono text-danger bg-canvas rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words mb-4 max-h-48 overflow-y-auto">
              {String(this.state.error?.message || this.state.error)}
              {this.state.info?.componentStack && (
                <span className="text-muted">
                  {'\n\n'}
                  {this.state.info.componentStack.split('\n').slice(0, 6).join('\n')}
                </span>
              )}
            </pre>
            <div className="flex gap-2">
              <button
                onClick={this.handleReset}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-surface1 hover:bg-surface2 text-strong transition-colors"
              >
                Tentar de novo
              </button>
              <button
                onClick={() => location.reload()}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-accent hover:bg-accent/90 text-strong transition-colors"
              >
                Recarregar
              </button>
            </div>
          </div>
        </div>
      )
    }
    if (this.props.className) {
      return (
        <div className={this.props.className}>
          {this.props.children}
        </div>
      )
    }
    return this.props.children
  }
}
