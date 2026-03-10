import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'packages/shared',
  'packages/bridge',
  'packages/cli',
  'packages/extension',
])
