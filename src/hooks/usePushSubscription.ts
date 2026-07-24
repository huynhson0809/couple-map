import { useCallback, useEffect, useRef, useState } from 'react'
import {
  browserPushSupported,
  readyServiceWorker,
  removeCurrentBrowserPushSubscription,
} from '../lib/browserPushSubscription'
import { supabase } from '../lib/supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

interface PushSnapshot {
  userId: string
  subscribed: boolean
}

export function usePushSubscription(userId: string | undefined) {
  const [snapshot, setSnapshot] = useState<PushSnapshot | null>(null)
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null)
  const [errorUserId, setErrorUserId] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const requestId = ++requestIdRef.current
    if (!userId) {
      return
    }

    const targetUserId = userId

    async function check() {
      setLoadingUserId(targetUserId)
      setErrorUserId(null)
      if (!browserPushSupported()) {
        if (requestId === requestIdRef.current) {
          setSnapshot({ userId: targetUserId, subscribed: false })
          setLoadingUserId(null)
        }
        return
      }

      try {
        const registration = await readyServiceWorker(5000)
        const subscription = await registration.pushManager.getSubscription()
        if (requestId !== requestIdRef.current) return

        if (!subscription) {
          setSnapshot({ userId: targetUserId, subscribed: false })
          setLoadingUserId(null)
          return
        }

        const { data, error } = await supabase
          .from('push_subscriptions')
          .select('endpoint')
          .eq('user_id', targetUserId)
          .eq('endpoint', subscription.endpoint)
          .maybeSingle()
        if (requestId !== requestIdRef.current) return

        if (error) {
          console.error('Could not verify push subscription:', error)
          setSnapshot({ userId: targetUserId, subscribed: false })
          setErrorUserId(targetUserId)
        } else if (data) {
          setSnapshot({ userId: targetUserId, subscribed: true })
        } else {
          await subscription.unsubscribe()
          if (requestId !== requestIdRef.current) return
          setSnapshot({ userId: targetUserId, subscribed: false })
        }
      } catch (error) {
        if (requestId !== requestIdRef.current) return
        console.error('Could not inspect push subscription:', error)
        setSnapshot({ userId: targetUserId, subscribed: false })
        setErrorUserId(targetUserId)
      } finally {
        if (requestId === requestIdRef.current) setLoadingUserId(null)
      }
    }

    const timer = window.setTimeout(() => {
      void check()
    }, 0)
    return () => {
      window.clearTimeout(timer)
      requestIdRef.current += 1
    }
  }, [userId])

  const subscribe = useCallback(async () => {
    if (!userId || !VAPID_PUBLIC_KEY || !browserPushSupported()) return false

    const requestId = ++requestIdRef.current
    const targetUserId = userId
    setLoadingUserId(targetUserId)
    setErrorUserId(null)

    try {
      const permission = await Notification.requestPermission()
      if (requestId !== requestIdRef.current) return false
      if (permission !== 'granted') {
        setLoadingUserId(null)
        return false
      }

      const registration = await readyServiceWorker(8000)
      let subscription = await registration.pushManager.getSubscription()
      if (requestId !== requestIdRef.current) return false

      if (!subscription) {
        const vapidKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey.buffer.slice(
            vapidKey.byteOffset,
            vapidKey.byteOffset + vapidKey.byteLength,
          ) as ArrayBuffer,
        })
      }

      const subJson = subscription.toJSON()
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: targetUserId,
          endpoint: subscription.endpoint,
          p256dh: subJson.keys?.p256dh ?? '',
          auth: subJson.keys?.auth ?? '',
        },
        { onConflict: 'endpoint' },
      )
      if (requestId !== requestIdRef.current) return false

      if (error) {
        console.error('Could not save push subscription:', error)
        await subscription.unsubscribe()
        if (requestId !== requestIdRef.current) return false
        setSnapshot({ userId: targetUserId, subscribed: false })
        setErrorUserId(targetUserId)
        setLoadingUserId(null)
        return false
      }

      setSnapshot({ userId: targetUserId, subscribed: true })
      setLoadingUserId(null)
      return true
    } catch (error) {
      if (requestId !== requestIdRef.current) return false
      console.error('Could not subscribe to push notifications:', error)
      setSnapshot({ userId: targetUserId, subscribed: false })
      setErrorUserId(targetUserId)
      setLoadingUserId(null)
      return false
    }
  }, [userId])

  const unsubscribe = useCallback(async () => {
    if (!userId) return false

    const requestId = ++requestIdRef.current
    const targetUserId = userId
    setLoadingUserId(targetUserId)
    setErrorUserId(null)

    try {
      await removeCurrentBrowserPushSubscription(targetUserId)
      if (requestId !== requestIdRef.current) return false
      setSnapshot({ userId: targetUserId, subscribed: false })
      setLoadingUserId(null)
      return true
    } catch (error) {
      if (requestId !== requestIdRef.current) return false
      console.error('Could not unsubscribe from push notifications:', error)
      setErrorUserId(targetUserId)
      setLoadingUserId(null)
      return false
    }
  }, [userId])

  const resolved = Boolean(snapshot && snapshot.userId === userId)

  return {
    subscribed: snapshot && snapshot.userId === userId ? snapshot.subscribed : false,
    loading: Boolean(userId && (loadingUserId === userId || !resolved)),
    error: errorUserId === userId,
    subscribe,
    unsubscribe,
  }
}
