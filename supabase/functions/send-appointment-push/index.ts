import '@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from '@supabase/server'
// @ts-types="npm:@types/luxon@3.7.1"
import { DateTime } from 'luxon'
import postgres from 'postgres'
// @ts-types="npm:@types/web-push@3.6.4"
import webpush from 'web-push'

const APP_URL = 'https://gad123145.github.io/real-estate-crm-ar/'
const APP_TIME_ZONE = 'Africa/Cairo'
const RETRY_WINDOW_MINUTES = 15

type AppointmentRow = {
  id: string
  user_id: string
  title: string
  appointment_type: string
  client_name: string
  appointment_date: string
  appointment_time: string
  duration_minutes: number
  location: string | null
}

type PushSubscriptionRow = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  reminder_lead_minutes: number
}

type WebPushConfig = {
  publicKey: string
  privateKey: string
  subject: string
}

function statusCode(error: unknown) {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    return Number(error.statusCode)
  }
  return 0
}

export default {
  fetch: withSupabase({ auth: ['publishable', 'secret'] }, async (req, ctx) => {
    if (req.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 })

    const databaseUrl = Deno.env.get('SUPABASE_DB_URL')
    if (!databaseUrl) throw new Error('SUPABASE_DB_URL is unavailable')
    const sql = postgres(databaseUrl, { max: 1, prepare: false })
    const configRows = await sql`
      select
        (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public_key') as "publicKey",
        (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private_key') as "privateKey",
        (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_subject') as subject
    `
    await sql.end()
    const config = configRows[0] as WebPushConfig | undefined
    if (!config?.publicKey || !config.privateKey || !config.subject) {
      throw new Error('Web Push Vault configuration is incomplete')
    }
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey)

    const now = DateTime.now().setZone(APP_TIME_ZONE)
    const firstDate = now.minus({ days: 1 }).toISODate()
    const lastDate = now.plus({ days: 1 }).toISODate()

    const [appointmentsResult, subscriptionsResult] = await Promise.all([
      ctx.supabaseAdmin
        .from('crm_appointments')
        .select('id,user_id,title,appointment_type,client_name,appointment_date,appointment_time,duration_minutes,location')
        .gte('appointment_date', firstDate)
        .lte('appointment_date', lastDate)
        .in('status', ['مؤكد', 'مبدئي']),
      ctx.supabaseAdmin
        .from('crm_push_subscriptions')
        .select('id,user_id,endpoint,p256dh,auth,reminder_lead_minutes')
        .eq('enabled', true),
    ])

    if (appointmentsResult.error) throw appointmentsResult.error
    if (subscriptionsResult.error) throw subscriptionsResult.error

    const appointments = (appointmentsResult.data ?? []) as AppointmentRow[]
    const subscriptions = (subscriptionsResult.data ?? []) as PushSubscriptionRow[]
    const subscriptionsByUser = new Map<string, PushSubscriptionRow[]>()
    for (const subscription of subscriptions) {
      subscriptionsByUser.set(subscription.user_id, [
        ...(subscriptionsByUser.get(subscription.user_id) ?? []),
        subscription,
      ])
    }

    let sent = 0
    let expired = 0
    let failed = 0

    for (const appointment of appointments) {
      const appointmentTime = DateTime.fromISO(
        `${appointment.appointment_date}T${appointment.appointment_time}`,
        { zone: APP_TIME_ZONE },
      )
      if (!appointmentTime.isValid) continue

      for (const subscription of subscriptionsByUser.get(appointment.user_id) ?? []) {
        const reminderTime = appointmentTime.minus({ minutes: subscription.reminder_lead_minutes })
        if (now < reminderTime || now > reminderTime.plus({ minutes: RETRY_WINDOW_MINUTES })) continue

        const scheduledFor = appointmentTime.toUTC().toISO()
        const reservation = await ctx.supabaseAdmin.from('crm_push_deliveries').insert({
          appointment_id: appointment.id,
          subscription_id: subscription.id,
          scheduled_for: scheduledFor,
        })
        if (reservation.error?.code === '23505') continue
        if (reservation.error) {
          console.error('Failed to reserve push delivery', reservation.error)
          failed += 1
          continue
        }

        const minutesUntil = Math.max(0, Math.ceil(appointmentTime.diff(now, 'minutes').minutes))
        const title = appointment.title || appointment.appointment_type || 'تنبيه موعد'
        const body = `${appointment.client_name || 'بدون عميل'} - ${minutesUntil > 0 ? `بعد ${minutesUntil} دقيقة` : 'حان موعده الآن'} - ${appointment.location || 'مكان غير محدد'}`

        try {
          await webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          }, JSON.stringify({
            title,
            body,
            appointmentId: appointment.id,
            tag: `appointment-${appointment.id}-${scheduledFor}`,
            url: APP_URL,
          }), { TTL: 60 * 60, urgency: 'high' })
          sent += 1
        } catch (error) {
          const code = statusCode(error)
          if (code === 404 || code === 410) {
            await ctx.supabaseAdmin.from('crm_push_subscriptions').delete().eq('id', subscription.id)
            expired += 1
          } else {
            await ctx.supabaseAdmin
              .from('crm_push_deliveries')
              .delete()
              .eq('appointment_id', appointment.id)
              .eq('subscription_id', subscription.id)
              .eq('scheduled_for', scheduledFor)
            console.error('Web Push delivery failed', error)
            failed += 1
          }
        }
      }
    }

    return Response.json({ checked: appointments.length, sent, expired, failed })
  }),
}
