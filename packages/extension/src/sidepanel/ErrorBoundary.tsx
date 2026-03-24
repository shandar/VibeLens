import { Component } from 'preact'
import type { ComponentChildren } from 'preact'

interface Props {
  children: ComponentChildren
}

interface State {
  error: Error | null
}

/**
 * H11: Error boundary for the side panel.
 * Catches rendering errors in the component tree and shows a
 * recovery UI instead of a blank white panel.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string }): void {
    console.error('[VibeLens] Side panel error:', error, info.componentStack)
  }

  private handleRetry = (): void => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <div style={styles.container}>
          <div style={styles.icon}>⚠️</div>
          <h2 style={styles.title}>Something went wrong</h2>
          <pre style={styles.message}>{this.state.error.message}</pre>
          <button onClick={this.handleRetry} style={styles.button}>
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const styles: Record<string, Record<string, string | number>> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    padding: '24px',
    background: '#0a0a0a',
    color: '#e0e0e0',
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
    textAlign: 'center',
  },
  icon: {
    fontSize: '32px',
    marginBottom: '12px',
  },
  title: {
    fontSize: '14px',
    fontWeight: '600',
    margin: '0 0 12px',
    color: '#ef4444',
  },
  message: {
    fontSize: '10px',
    fontFamily: 'SF Mono, Menlo, Consolas, monospace',
    color: '#999',
    background: '#1a1a1a',
    padding: '8px 12px',
    borderRadius: '4px',
    maxWidth: '100%',
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: '0 0 16px',
  },
  button: {
    padding: '6px 16px',
    border: '1px solid #7c3aed',
    borderRadius: '4px',
    background: 'transparent',
    color: '#7c3aed',
    fontSize: '12px',
    cursor: 'pointer',
  },
}
