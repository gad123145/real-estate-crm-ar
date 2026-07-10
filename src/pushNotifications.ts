import { supabase } from './supabaseClient'

const vapidPublicKey = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim() ?? ''

function getClient() {
  if (!supabase) throw new Error('اتصال Supabase غير مضبوط.')
  return supabase
}

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

export function supportsAppointmentPush() {
  return Boolean(
    vapidPublicKey
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window,
  )
}

export function appointmentPushConfigurationMessage() {
  if (!vapidPublicKey) return 'مفتاح إشعارات الخادم غير مضبوط بعد.'
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'هذا الجهاز لا يدعم Web Push. على iPhone ثبّت التطبيق على الشاشة الرئيسية أولًا ثم افتحه من الأيقونة.'
  }
  return ''
}

export async function enableAppointmentPush(reminderLeadMinutes: number) {
  const configurationError = appointmentPushConfigurationMessage()
  if (configurationError) throw new Error(configurationError)

  const client = getClient()
  const { data: userData, error: userError } = await client.auth.getUser()
  if (userError) throw userError
  if (!userData.user) throw new Error('سجل الدخول أولًا لتفعيل إشعارات الهاتف.')

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })
  }

  const serialized = subscription.toJSON()
  if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys?.auth) {
    throw new Error('تعذر قراءة بيانات اشتراك الإشعارات من الهاتف.')
  }

  const { error } = await client.from('crm_push_subscriptions').upsert({
    user_id: userData.user.id,
    endpoint: serialized.endpoint,
    p256dh: serialized.keys.p256dh,
    auth: serialized.keys.auth,
    reminder_lead_minutes: reminderLeadMinutes,
    user_agent: navigator.userAgent,
    enabled: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })

  if (error) throw error
  return subscription
}

export async function refreshAppointmentPush(reminderLeadMinutes: number) {
  if (!supportsAppointmentPush() || Notification.permission !== 'granted') return false
  await enableAppointmentPush(reminderLeadMinutes)
  return true
}

export async function disableAppointmentPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  const client = getClient()
  const { error } = await client
    .from('crm_push_subscriptions')
    .delete()
    .eq('endpoint', subscription.endpoint)

  if (error) throw error
  await subscription.unsubscribe()
}
