import { render } from 'preact'
import { App } from './App.js'
import { ErrorBoundary } from './ErrorBoundary.js'

const root = document.getElementById('root')
if (root) {
  render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
    root,
  )
}
