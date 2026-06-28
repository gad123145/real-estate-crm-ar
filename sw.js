// ===== نظام تنبيهات المواعيد في الخلفية =====
const APPOINTMENTS_CACHE = 'crm-appointments-v1'
const SETTINGS_CACHE = 'crm-settings-v1'
const REMINDER_CHECK_TAG = 'crm-reminder-check'

// التثبيت - أخذ التحكم فوراً
self.addEventListener('install', () => {
  void self.skipWaiting()
})

// قراءة المواعيد المخزنة من الـ cache
async function readStoredAppointments() {
  try {
    const cache = await caches.open(APPOINTMENTS_CACHE)
    const response = await cache.match('appointments.json')
    if (!response) return []
    return await response.json()
  } catch {
    return []
  }
}

// قراءة إعدادات التذكير من الـ cache
async function readStoredSettings() {
  try {
    const cache = await caches.open(SETTINGS_CACHE)
    const response = await cache.match('settings.json')
    if (!response) return { reminderLeadMinutes: 30 }
    return await response.json()
  } catch {
    return { reminderLeadMinutes: 30 }
  }
}

// تحويل التاريخ والوقت إلى timestamp
function appointmentStart(appointment) {
  if (!appointment.date) return Number.MAX_SAFE_INTEGER
  const time = appointment.time || '00:00'
  return new Date(`${appointment.date}T${time}:00`).getTime()
}

function appointmentEnd(appointment) {
  const start = appointmentStart(appointment)
  const duration = Number(appointment.durationMinutes) || 0
  return start + duration * 60000
}

function isLiveStatus(status) {
  return status !== 'تم' && status !== 'ملغي'
}

function minutesUntilAppointment(appointment, now) {
  return Math.round((appointmentStart(appointment) - now) / 60000)
}

// فحص المواعيد المستحقة وإرسال إشعارات
async function checkDueAppointments() {
  const appointments = await readStoredAppointments()
  const settings = await readStoredSettings()
  if (!appointments.length) return

  const now = Date.now()
  const reminderLeadMs = (settings.reminderLeadMinutes || 30) * 60000
  const liveAppointments = appointments.filter((a) => isLiveStatus(a.status))

  // البحث عن موعد مستحق (داخل نافذة التذكير ولم ينتهِ بعد)
  const dueAppointment = liveAppointments
    .filter((a) => appointmentStart(a) - reminderLeadMs <= now && appointmentEnd(a) > now)
    .sort((a, b) => appointmentStart(a) - appointmentStart(b))[0]

  if (!dueAppointment) return

  const minutesUntil = minutesUntilAppointment(dueAppointment, now)
  const title = dueAppointment.title || dueAppointment.appointmentType || 'تنبيه موعد'
  const body = `${dueAppointment.clientName || 'بدون عميل'} - ${minutesUntil > 0 ? `بعد ${minutesUntil} دقيقة` : 'الموعد بدأ أو متأخر'} - ${dueAppointment.location || 'مكان غير محدد'}`

  // التحقق من عدم وجود إشعار سابق لنفس الموعد خلال آخر 90 ثانية
  try {
    const existing = await self.registration.getNotifications({ tag: `sw-appointment-${dueAppointment.id}` })
    if (existing && existing.length > 0) return
  } catch {
    // تجاهل الأخطاء
  }

  await self.registration.showNotification(title, {
    body,
    icon: `${self.registration.scope}icons.svg`,
    badge: `${self.registration.scope}icons.svg`,
    tag: `sw-appointment-${dueAppointment.id}`,
    renotify: true,
    requireInteraction: true,
    data: { appointmentId: dueAppointment.id, url: self.registration.scope },
  })
}

// ===== فحص فوري عند تنشيط الـ Service Worker =====
let internalCheckTimer = null

function startInternalPeriodicCheck() {
  if (internalCheckTimer) return
  // فحص دوري كل دقيقتين داخل الـ Service Worker (يعمل حتى بدون periodicsync)
  internalCheckTimer = setInterval(() => {
    void checkDueAppointments()
  }, 2 * 60 * 1000)
}

function stopInternalPeriodicCheck() {
  if (internalCheckTimer) {
    clearInterval(internalCheckTimer)
    internalCheckTimer = null
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim()
      // تسجيل periodic sync إذا كان مدعوماً
      if ('periodicSync' in self.registration) {
        try {
          await self.registration.periodicSync.register(REMINDER_CHECK_TAG, {
            minInterval: 5 * 60 * 1000, // كل 5 دقائق كحد أدنى
          })
        } catch {
          // تجاهل إذا لم يكن مدعوماً أو لم يُسمح به
        }
      }
      // تشغيل الفحص الدوري الداخلي + فحص فوري
      startInternalPeriodicCheck()
      await checkDueAppointments()
    })()
  )
})

// ===== Periodic Background Sync - يعمل في الخلفية بشكل دوري =====
self.addEventListener('periodicsync', (event) => {
  if (event.tag === REMINDER_CHECK_TAG) {
    event.waitUntil(checkDueAppointments())
  }
})

// ===== رسائل من التطبيق الرئيسي (تحديث المواعيد/الإعدادات) =====
self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type === 'UPDATE_APPOINTMENTS') {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(APPOINTMENTS_CACHE)
        await cache.put('appointments.json', new Response(JSON.stringify(data.appointments || []), {
          headers: { 'Content-Type': 'application/json' },
        }))
        await checkDueAppointments()
      })()
    )
  } else if (data.type === 'UPDATE_SETTINGS') {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(SETTINGS_CACHE)
        await cache.put('settings.json', new Response(JSON.stringify(data.settings || {}), {
          headers: { 'Content-Type': 'application/json' },
        }))
        await checkDueAppointments()
      })()
    )
  } else if (data.type === 'CHECK_NOW') {
    event.waitUntil(checkDueAppointments())
  } else if (data.type === 'START_CHECKING') {
    startInternalPeriodicCheck()
    event.waitUntil(checkDueAppointments())
  } else if (data.type === 'STOP_CHECKING') {
    stopInternalPeriodicCheck()
  }
})

// ===== النقر على الإشعار =====
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil((async () => {
    const appUrl = new URL(self.registration.scope)
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    const currentWindow = windows.find((client) => client.url.startsWith(appUrl.href))

    if (currentWindow) {
      await currentWindow.focus()
      return
    }

    await clients.openWindow(appUrl.href)
  })())
})