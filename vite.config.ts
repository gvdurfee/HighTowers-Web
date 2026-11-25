import { execSync } from 'node:child_process'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// GitHub project Pages: set VITE_BASE_PATH in CI (see .github/workflows/pages.yml).
const base = (process.env.VITE_BASE_PATH || '/').replace(/\/+$/, '') + '/'

function htwBuildId(): string {
  const fromCi = process.env.GITHUB_SHA?.trim()
  let sha = fromCi
  if (!sha) {
    try {
      sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
    } catch {
      sha = 'unknown'
    }
  }
  return `${sha} ${new Date().toISOString()}`
}

function versionJsonPlugin(id: string): Plugin {
  return {
    name: 'htw-version-json',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id }) })
    },
  }
}

const buildId = htwBuildId()

export default defineConfig({
  base,
  define: {
    __HTW_BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [react(), versionJsonPlugin(buildId)],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@content-pack/core': path.resolve(__dirname, './shared/content-pack-core'),
      '@survey-planning': path.resolve(__dirname, './shared/survey-planning'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
