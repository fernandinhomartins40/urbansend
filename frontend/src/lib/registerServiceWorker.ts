/**
 * Registro do service worker.
 *
 * Fica fora do React de proposito: e infraestrutura, roda uma vez por sessao
 * e nao deve depender do ciclo de vida de nenhum componente.
 */

// Mesmo padrao de acesso usado em `apiBase.ts`: o projeto nao referencia
// os tipos de `vite/client`, entao `import.meta.env` e lido sem tipagem.
const isProduction = Boolean((import.meta as any).env?.PROD)

export const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) {
    return
  }

  // Em dev o SW atrapalha o HMR e mascara mudancas de codigo.
  if (!isProduction) {
    return
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        // Uma versao nova assume assim que estiver pronta, sem pedir acao
        // ao usuario: o SW so guarda a casca, entao a troca e segura.
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing
          if (!installing) return

          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              installing.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        })
      })
      .catch(() => {
        // Falha no registro nao pode derrubar a aplicacao.
      })
  })

  let hasReloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Recarrega uma unica vez para adotar a casca nova.
    if (hasReloaded) return
    hasReloaded = true
    window.location.reload()
  })
}
