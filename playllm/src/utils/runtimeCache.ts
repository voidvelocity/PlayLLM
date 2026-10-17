export const clearBrowserAssetCaches = async () => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return

  if ('caches' in window) {
    const cacheNames = await window.caches.keys()
    await Promise.all(cacheNames.map(cacheName => window.caches.delete(cacheName)))
  }

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map(registration => registration.unregister()))
  }
}
