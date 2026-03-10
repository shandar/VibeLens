import * as vscode from 'vscode'
import { Bridge } from '@vibelens/bridge'
import type { FrameworkType } from '@vibelens/shared'

let bridge: Bridge | null = null
let statusBarItem: vscode.StatusBarItem

export function activate(context: vscode.ExtensionContext): void {
  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  statusBarItem.command = 'vibelens.restart'
  context.subscriptions.push(statusBarItem)

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('vibelens.start', () => startBridge()),
    vscode.commands.registerCommand('vibelens.stop', () => stopBridge()),
    vscode.commands.registerCommand('vibelens.restart', () => restartBridge()),
  )

  // Auto-start if configured
  const config = vscode.workspace.getConfiguration('vibelens')
  if (config.get<boolean>('autoStart', true)) {
    startBridge()
  }

  updateStatusBar('disconnected')
}

async function startBridge(): Promise<void> {
  if (bridge?.info.running) {
    vscode.window.showInformationMessage('VibeLens bridge is already running')
    return
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
  if (!workspaceFolder) {
    vscode.window.showWarningMessage('VibeLens: No workspace folder found')
    return
  }

  const config = vscode.workspace.getConfiguration('vibelens')
  const port = config.get<number>('port', 9119)
  const frameworkSetting = config.get<string>('framework', 'auto')
  const ignorePatterns = config.get<string[]>('ignorePatterns', [])

  bridge = new Bridge({
    port,
    projectRoot: workspaceFolder.uri.fsPath,
    framework: frameworkSetting === 'auto' ? undefined : (frameworkSetting as FrameworkType),
    ignorePatterns,
  })

  try {
    await bridge.start()
    updateStatusBar('connected')

    const info = bridge.info
    const frameworkInfo = info.framework ? ` (${info.framework})` : ''
    vscode.window.showInformationMessage(
      `VibeLens bridge started on port ${info.port}${frameworkInfo}`,
    )
  } catch (err) {
    updateStatusBar('error')
    const message = err instanceof Error ? err.message : 'Unknown error'
    vscode.window.showErrorMessage(`VibeLens: Failed to start bridge — ${message}`)
  }
}

async function stopBridge(): Promise<void> {
  if (bridge) {
    await bridge.stop()
    bridge = null
    updateStatusBar('disconnected')
    vscode.window.showInformationMessage('VibeLens bridge stopped')
  }
}

async function restartBridge(): Promise<void> {
  await stopBridge()
  await startBridge()
}

function updateStatusBar(status: 'connected' | 'disconnected' | 'error'): void {
  const icons: Record<string, string> = {
    connected: '$(eye)',
    disconnected: '$(eye-closed)',
    error: '$(warning)',
  }

  const colors: Record<string, vscode.ThemeColor | undefined> = {
    connected: undefined,
    disconnected: new vscode.ThemeColor('statusBarItem.warningForeground'),
    error: new vscode.ThemeColor('statusBarItem.errorForeground'),
  }

  statusBarItem.text = `${icons[status]} VibeLens`
  statusBarItem.color = colors[status]
  statusBarItem.tooltip = `VibeLens Bridge: ${status}`
  statusBarItem.show()
}

export async function deactivate(): Promise<void> {
  await bridge?.stop()
}
