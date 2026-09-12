/**
 * Service worker da VeloMail.
 *
 * Estrategia deliberadamente conservadora: a aplicacao e autenticada e
 * orientada a dados vivos, entao nada de /api e nada com credenciais entra
 * em cache. O SW cuida apenas do app shell (navegacao + assets versionados
 * pelo build) para que a PWA instalada abra rapido e degrade com elegancia
 * quando a conexao cair.
 */

const VERSION = 'v1'
const SHELL_CACHE = `velomail-shell-${VERSION}`
const ASSET_CACHE = `velomail-assets-${VERSION}`
const OFFLINE_URL = '/offline.html'

// Minimo indispensavel para a casca abrir offline.
const SHELL_ASSETS = ['/index.html', OFFLINE_URL, '/favicon.png', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      // Um asset ausente nao pode impedir a instalacao do SW.
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('velomail-') && key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

// Permite que a aplicacao peca a troca imediata de versao.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

const isApiRequest = (url) => url.pathname.startsWith('/api')

const isVersionedAsset = (url) =>
  url.pathname.startsWith('/assets/') || url.pathname.startsWith('/landing/') || url.pathname === '/favicon.png'

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)

  // Outras origens e a API ficam totalmente fora do SW: dados autenticados
  // nunca devem ser servidos de cache.
  if (url.origin !== self.location.origin || isApiRequest(url)) {
    return
  }

  // Navegacao: rede primeiro, cache como rede de seguranca. Garante que o
  // usuario nunca veja uma casca antiga enquanto estiver online.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy))
          return response
        })
        .catch(async () => {
          const cached = await caches.match('/index.html')
          return cached || caches.match(OFFLINE_URL)
        })
    )
    return
  }

  // Assets com hash no nome sao imutaveis: cache primeiro e barato.
  if (isVersionedAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached
        }

        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
      })
    )
  }
})
