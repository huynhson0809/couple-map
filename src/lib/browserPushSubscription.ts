import { supabase } from './supabase'

export function browserPushSupported() {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  )
}

export async function readyServiceWorker(
  timeoutMs: number,
): Promise<ServiceWorkerRegistration> {
  if (!browserPushSupported()) throw new Error('push_not_supported')

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error('service_worker_ready_timeout')),
      timeoutMs,
    )

    void navigator.serviceWorker.ready.then(
      (registration) => {
        window.clearTimeout(timer)
        resolve(registration)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export async function removeCurrentBrowserPushSubscription(
  userId?: string,
): Promise<void> {
  if (!browserPushSupported()) return

  const registration = await readyServiceWorker(3000)
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  if (userId) {
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', subscription.endpoint)
    if (error) {
      console.error('Could not remove push subscription from the server:', error)
    }
  }

  await subscription.unsubscribe()
}
