import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import JSZip from 'jszip'
import {
  askCrmAssistant,
  defaultAiSettings,
  extractCrmForm,
  fetchAiModels,
  rankCrmRecords,
  type AiFormTarget,
  type AiModelOption,
  type AiProvider,
  type AiSearchResult,
  type AiSettings,
} from './aiAssistant'
import './App.css'
import {
  createAppointmentRecord,
  createDemandClient,
  createPropertyOwner,
  deletePropertyMediaRecord,
  deleteAppointmentRecord,
  deleteDemandClientAndAppointments,
  deletePropertyOwnerAndAppointments,
  fetchCrmData,
  getCrmErrorMessage,
  uploadPropertyMedia,
  updateAppointmentRecord,
  updateDemandClient,
  updatePropertyOwner,
} from './supabaseData'
import { isSupabaseConfigured, supabase } from './supabaseClient'

type ActiveSection = 'dashboard' | 'owners' | 'seekers' | 'appointments' | 'propertyDetail' | 'ai'
export type ClientKind = 'owner' | 'seeker' | 'general'
export type MediaKind = 'image' | 'video' | 'file'

export type OwnerStatus = 'جديد' | 'جارى المتابعة' | 'جاهز للعرض' | 'تم التسويق' | 'مؤجل'
export type SeekerStatus = 'جديد' | 'مهتم' | 'تم الترشيح' | 'جارى التفاوض' | 'تم الإغلاق' | 'مؤجل'
export type AppointmentStatus = 'مؤكد' | 'مبدئي' | 'تم' | 'ملغي'

export interface PropertyMedia {
  id: string
  ownerId: string
  createdAt: string
  fileName: string
  fileType: string
  fileSize: number
  mediaKind: MediaKind
  storagePath: string
  publicUrl: string
}

export interface PropertyOwner {
  id: string
  createdAt: string
  propertyCode: string
  ownerName: string
  phone: string
  whatsapp: string
  propertyType: string
  listingIntent: string
  buildingName: string
  unitNumber: string
  city: string
  district: string
  address: string
  price: string
  area: string
  bedrooms: string
  bathrooms: string
  receptionRooms: string
  floor: string
  finishing: string
  furnishing: string
  viewDescription: string
  licenseStatus: string
  deliveryDate: string
  paymentPlan: string
  amenities: string
  mapUrl: string
  virtualTourUrl: string
  availability: string
  status: OwnerStatus
  source: string
  notes: string
  media: PropertyMedia[]
}

export interface DemandClient {
  id: string
  createdAt: string
  name: string
  phone: string
  requestIntent: string
  propertyType: string
  city: string
  preferredAreas: string
  budget: string
  paymentMethod: string
  urgency: string
  status: SeekerStatus
  details: string
  notes: string
}

export interface Appointment {
  id: string
  createdAt: string
  title: string
  appointmentType: string
  clientKind: ClientKind
  linkedClientId: string
  clientName: string
  phone: string
  date: string
  time: string
  durationMinutes: number
  location: string
  status: AppointmentStatus
  notes: string
}

export type OwnerForm = Omit<PropertyOwner, 'id' | 'createdAt' | 'media'>
export type SeekerForm = Omit<DemandClient, 'id' | 'createdAt'>
export type AppointmentForm = Omit<Appointment, 'id' | 'createdAt' | 'durationMinutes'> & {
  durationMinutes: string
}

const PROPERTY_TYPES = ['شقة', 'دوبلكس', 'بيزمنت', 'فيلا', 'تاون هاوس', 'استوديو', 'مكتب', 'محل', 'أرض', 'أخرى']
const OWNER_STATUSES: OwnerStatus[] = ['جديد', 'جارى المتابعة', 'جاهز للعرض', 'تم التسويق', 'مؤجل']
const SEEKER_STATUSES: SeekerStatus[] = ['جديد', 'مهتم', 'تم الترشيح', 'جارى التفاوض', 'تم الإغلاق', 'مؤجل']
const APPOINTMENT_STATUSES: AppointmentStatus[] = ['مؤكد', 'مبدئي', 'تم', 'ملغي']
const APPOINTMENT_TYPES = ['مكالمة', 'معاينة', 'متابعة', 'توقيع عقد', 'تحصيل', 'مقابلة']
const AI_SETTINGS_STORAGE_KEY = 'real-estate-crm-ai-settings'
const REMINDER_LEAD_STORAGE_KEY = 'real-estate-crm-reminder-lead-minutes'
const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
  custom: 'OpenAI متوافق',
}
const AI_TARGET_LABELS: Record<AiFormTarget, string> = {
  owner: 'مالك وعقار',
  seeker: 'عميل طالب',
  appointment: 'موعد',
}
const SEARCH_KIND_LABELS: Record<AiSearchResult['kind'], string> = {
  owner: 'عقار مالك',
  seeker: 'طلب عميل',
  appointment: 'موعد',
}

const emptyOwnerForm: OwnerForm = {
  propertyCode: '',
  ownerName: '',
  phone: '',
  whatsapp: '',
  propertyType: 'شقة',
  listingIntent: 'بيع',
  buildingName: '',
  unitNumber: '',
  city: '',
  district: '',
  address: '',
  price: '',
  area: '',
  bedrooms: '',
  bathrooms: '',
  receptionRooms: '',
  floor: '',
  finishing: '',
  furnishing: '',
  viewDescription: '',
  licenseStatus: '',
  deliveryDate: '',
  paymentPlan: '',
  amenities: '',
  mapUrl: '',
  virtualTourUrl: '',
  availability: '',
  status: 'جديد',
  source: '',
  notes: '',
}

const emptySeekerForm: SeekerForm = {
  name: '',
  phone: '',
  requestIntent: 'شراء',
  propertyType: 'شقة',
  city: '',
  preferredAreas: '',
  budget: '',
  paymentMethod: '',
  urgency: 'عادي',
  status: 'جديد',
  details: '',
  notes: '',
}

const numberFormatter = new Intl.NumberFormat('ar-EG')
const dateFormatter = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' })
const dateTimeFormatter = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })

function toDateInputValue(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return localDate.toISOString().slice(0, 10)
}

function makeEmptyAppointmentForm(): AppointmentForm {
  return {
    title: '',
    appointmentType: 'معاينة',
    clientKind: 'general',
    linkedClientId: '',
    clientName: '',
    phone: '',
    date: toDateInputValue(),
    time: '12:00',
    durationMinutes: '60',
    location: '',
    status: 'مؤكد',
    notes: '',
  }
}

function formatDate(value: string) {
  if (!value) return 'بدون تاريخ'
  return dateFormatter.format(new Date(`${value}T12:00:00`))
}

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value))
}

function normalizeSearchValue(value: string) {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩'
  return value
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function searchTokens(value: string) {
  return normalizeSearchValue(value)
    .split(/[^\p{L}\p{N}+]+/u)
    .filter(Boolean)
}

function matchesSearch(searchText: string, query: string) {
  const tokens = searchTokens(query)
  if (tokens.length === 0) return true
  const normalizedText = normalizeSearchValue(searchText)
  return tokens.every((token) => normalizedText.includes(token))
}

function ownerSearchText(owner: PropertyOwner) {
  return [
    'مالك', owner.ownerName,
    'هاتف', owner.phone,
    'واتساب', owner.whatsapp,
    'كود', owner.propertyCode,
    'نوع', owner.propertyType,
    'عرض', owner.listingIntent,
    'كمبوند عمارة مبنى', owner.buildingName,
    'وحدة', owner.unitNumber,
    'مدينة', owner.city,
    'منطقة', owner.district,
    'عنوان', owner.address,
    'سعر', owner.price,
    'مساحة', owner.area,
    'غرف', owner.bedrooms,
    'حمامات', owner.bathrooms,
    'ريسبشن صالات', owner.receptionRooms,
    'دور', owner.floor,
    'تشطيب', owner.finishing,
    'فرش', owner.furnishing,
    'فيو واجهة', owner.viewDescription,
    'ترخيص عقد', owner.licenseStatus,
    'تسليم', owner.deliveryDate,
    'دفع تقسيط', owner.paymentPlan,
    'مميزات خدمات', owner.amenities,
    'خريطة', owner.mapUrl,
    'جولة فيديو', owner.virtualTourUrl,
    'اتاحة', owner.availability,
    'حالة', owner.status,
    'مصدر', owner.source,
    'ملاحظات', owner.notes,
    ...owner.media.flatMap((media) => ['وسائط', media.fileName, media.fileType, media.mediaKind]),
  ].filter(Boolean).join(' ')
}

function seekerSearchText(seeker: DemandClient) {
  return [
    'عميل طالب', seeker.name,
    'هاتف', seeker.phone,
    'طلب', seeker.requestIntent,
    'نوع', seeker.propertyType,
    'مدينة', seeker.city,
    'مناطق', seeker.preferredAreas,
    'ميزانية', seeker.budget,
    'دفع', seeker.paymentMethod,
    'استعجال', seeker.urgency,
    'حالة', seeker.status,
    'تفاصيل', seeker.details,
    'ملاحظات', seeker.notes,
  ].filter(Boolean).join(' ')
}

function appointmentSearchText(appointment: Appointment) {
  return [
    'موعد معاينة متابعة', appointment.title,
    'نوع', appointment.appointmentType,
    'عميل', appointment.clientName,
    'هاتف', appointment.phone,
    'تاريخ', appointment.date,
    'وقت', appointment.time,
    'مدة', String(appointment.durationMinutes),
    'مكان', appointment.location,
    'حالة', appointment.status,
    'ملاحظات', appointment.notes,
  ].filter(Boolean).join(' ')
}

function readDurationMinutes(value: string | number) {
  return Math.max(15, Number(value) || 60)
}

function appointmentStart(appointment: Pick<Appointment, 'date' | 'time'>) {
  return new Date(`${appointment.date}T${appointment.time}`).getTime()
}

function appointmentEnd(appointment: Pick<Appointment, 'date' | 'time'> & { durationMinutes: string | number }) {
  return appointmentStart(appointment) + readDurationMinutes(appointment.durationMinutes) * 60000
}

function minutesUntilAppointment(appointment: Pick<Appointment, 'date' | 'time'>) {
  return Math.ceil((appointmentStart(appointment) - Date.now()) / 60000)
}

function isLiveAppointment(status: AppointmentStatus) {
  return status === 'مؤكد' || status === 'مبدئي'
}

function findAppointmentConflicts(
  candidate: Appointment | (AppointmentForm & { id?: string }),
  appointments: Appointment[],
) {
  if (!candidate.date || !candidate.time || !isLiveAppointment(candidate.status)) return []

  const candidateStart = appointmentStart(candidate)
  const candidateEnd = appointmentEnd(candidate)

  return appointments.filter((appointment) => {
    if (appointment.id === candidate.id || appointment.date !== candidate.date || !isLiveAppointment(appointment.status)) {
      return false
    }

    const start = appointmentStart(appointment)
    const end = appointmentEnd(appointment)
    return candidateStart < end && start < candidateEnd
  })
}

function clientKindLabel(kind: ClientKind) {
  if (kind === 'owner') return 'مالك'
  if (kind === 'seeker') return 'طالب'
  return 'عام'
}

function phoneHref(phone: string) {
  const compactPhone = phone.replace(/[^\d+]/g, '')
  return compactPhone ? 'tel:' + compactPhone : undefined
}

function whatsappHref(phone: string) {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = `20${digits.slice(1)}`
  return digits ? `https://wa.me/${digits}` : undefined
}

function fileSizeLabel(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function safeDownloadName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'property'
}

function isAiProvider(value: unknown): value is AiProvider {
  return value === 'gemini' || value === 'openrouter' || value === 'custom'
}

function readSavedAiSettings(): AiSettings {
  try {
    const stored = localStorage.getItem(AI_SETTINGS_STORAGE_KEY)
    if (!stored) return { ...defaultAiSettings }
    const parsed = JSON.parse(stored) as Partial<AiSettings>
    return {
      ...defaultAiSettings,
      ...parsed,
      provider: isAiProvider(parsed.provider) ? parsed.provider : defaultAiSettings.provider,
    }
  } catch {
    return { ...defaultAiSettings }
  }
}

function aiValue(data: Record<string, string>, key: string, fallback = '') {
  return data[key]?.trim() || fallback
}

function normalizeArabicChoice(value: string) {
  return value.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim()
}

function pickOption<T extends string>(value: string, options: readonly T[], fallback: T) {
  const normalizedValue = normalizeArabicChoice(value)
  return options.find((option) => {
    const normalizedOption = normalizeArabicChoice(option)
    return normalizedValue === normalizedOption || normalizedValue.includes(normalizedOption) || normalizedOption.includes(normalizedValue)
  }) ?? fallback
}

function normalizeDateInput(value: string, fallback: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : fallback
}

function normalizeTimeInput(value: string, fallback = '12:00') {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return fallback
  const hour = Math.min(23, Math.max(0, Number(match[1]))).toString().padStart(2, '0')
  const minute = Math.min(59, Math.max(0, Number(match[2]))).toString().padStart(2, '0')
  return `${hour}:${minute}`
}

function readSavedReminderLeadMinutes() {
  try {
    return Math.min(1440, Math.max(0, Number(localStorage.getItem(REMINDER_LEAD_STORAGE_KEY)) || 30))
  } catch {
    return 30
  }
}

function playReminderTone(audioContextRef: { current: AudioContext | null }) {
  const contextWindow = window as Window & { webkitAudioContext?: typeof AudioContext }
  const AudioContextConstructor = window.AudioContext || contextWindow.webkitAudioContext
  if (!AudioContextConstructor) return

  const audioContext = audioContextRef.current ?? new AudioContextConstructor()
  audioContextRef.current = audioContext
  void audioContext.resume()

  const start = audioContext.currentTime
  ;[0, 0.28, 0.56].forEach((offset) => {
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(920, start + offset)
    gain.gain.setValueAtTime(0.0001, start + offset)
    gain.gain.exponentialRampToValueAtTime(0.26, start + offset + 0.025)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.18)
    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    oscillator.start(start + offset)
    oscillator.stop(start + offset + 0.2)
  })
}

async function showReminderNotification(appointment: Appointment, minutesUntil: number) {
  const title = appointment.title || appointment.appointmentType
  const notificationOptions: NotificationOptions & { renotify?: boolean } = {
    body: `${appointment.clientName || 'بدون عميل'} - ${minutesUntil > 0 ? `بعد ${minutesUntil} دقيقة` : 'موعد بدأ أو متأخر'} - ${appointment.location || 'مكان غير محدد'}`,
    icon: `${import.meta.env.BASE_URL}icons.svg`,
    badge: `${import.meta.env.BASE_URL}icons.svg`,
    tag: `appointment-${appointment.id}`,
    renotify: true,
    requireInteraction: true,
  }

  if ('serviceWorker' in navigator) {
    try {
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<ServiceWorkerRegistration>((_, reject) => window.setTimeout(() => reject(new Error('service worker timeout')), 1500)),
      ])
      await registration.showNotification(title, notificationOptions)
      return
    } catch {
      // Fall back to the standard notification path below.
    }
  }

  const notification = new Notification(title, notificationOptions)
  notification.onclick = () => {
    window.focus()
  }
}

function ownerToForm(owner: PropertyOwner): OwnerForm {
  return {
    propertyCode: owner.propertyCode,
    ownerName: owner.ownerName,
    phone: owner.phone,
    whatsapp: owner.whatsapp,
    propertyType: owner.propertyType,
    listingIntent: owner.listingIntent,
    buildingName: owner.buildingName,
    unitNumber: owner.unitNumber,
    city: owner.city,
    district: owner.district,
    address: owner.address,
    price: owner.price,
    area: owner.area,
    bedrooms: owner.bedrooms,
    bathrooms: owner.bathrooms,
    receptionRooms: owner.receptionRooms,
    floor: owner.floor,
    finishing: owner.finishing,
    furnishing: owner.furnishing,
    viewDescription: owner.viewDescription,
    licenseStatus: owner.licenseStatus,
    deliveryDate: owner.deliveryDate,
    paymentPlan: owner.paymentPlan,
    amenities: owner.amenities,
    mapUrl: owner.mapUrl,
    virtualTourUrl: owner.virtualTourUrl,
    availability: owner.availability,
    status: owner.status,
    source: owner.source,
    notes: owner.notes,
  }
}

function seekerToForm(seeker: DemandClient): SeekerForm {
  return {
    name: seeker.name,
    phone: seeker.phone,
    requestIntent: seeker.requestIntent,
    propertyType: seeker.propertyType,
    city: seeker.city,
    preferredAreas: seeker.preferredAreas,
    budget: seeker.budget,
    paymentMethod: seeker.paymentMethod,
    urgency: seeker.urgency,
    status: seeker.status,
    details: seeker.details,
    notes: seeker.notes,
  }
}

function appointmentToForm(appointment: Appointment): AppointmentForm {
  return {
    title: appointment.title,
    appointmentType: appointment.appointmentType,
    clientKind: appointment.clientKind,
    linkedClientId: appointment.linkedClientId,
    clientName: appointment.clientName,
    phone: appointment.phone,
    date: appointment.date,
    time: appointment.time,
    durationMinutes: String(appointment.durationMinutes),
    location: appointment.location,
    status: appointment.status,
    notes: appointment.notes,
  }
}

function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('dashboard')
  const [owners, setOwners] = useState<PropertyOwner[]>([])
  const [seekers, setSeekers] = useState<DemandClient[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [initialClock] = useState(() => ({ today: toDateInputValue(), now: Date.now() }))
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const [ownerForm, setOwnerForm] = useState<OwnerForm>({ ...emptyOwnerForm })
  const [ownerFiles, setOwnerFiles] = useState<File[]>([])
  const [seekerForm, setSeekerForm] = useState<SeekerForm>({ ...emptySeekerForm })
  const [appointmentForm, setAppointmentForm] = useState<AppointmentForm>(() => makeEmptyAppointmentForm())
  const [editingOwnerId, setEditingOwnerId] = useState<string | null>(null)
  const [editingSeekerId, setEditingSeekerId] = useState<string | null>(null)
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null)
  const [ownerSearch, setOwnerSearch] = useState('')
  const [seekerSearch, setSeekerSearch] = useState('')
  const [appointmentSearch, setAppointmentSearch] = useState('')
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null)
  const [downloadingOwnerId, setDownloadingOwnerId] = useState<string | null>(null)
  const [mediaArchive, setMediaArchive] = useState<{ ownerId: string; url: string; name: string } | null>(null)
  const mediaArchiveUrlRef = useRef<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured)
  const [dataLoading, setDataLoading] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [aiSettings, setAiSettings] = useState<AiSettings>(() => readSavedAiSettings())
  const [aiModels, setAiModels] = useState<AiModelOption[]>([])
  const [aiTarget, setAiTarget] = useState<AiFormTarget>('owner')
  const [aiInput, setAiInput] = useState('')
  const [aiFiles, setAiFiles] = useState<File[]>([])
  const [aiQuestion, setAiQuestion] = useState('')
  const [aiAnswer, setAiAnswer] = useState('')
  const [aiResults, setAiResults] = useState<AiSearchResult[]>([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiStatus, setAiStatus] = useState('')
  const [reminderLeadMinutes, setReminderLeadMinutes] = useState(() => readSavedReminderLeadMinutes())
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() => (
    'Notification' in window ? Notification.permission : 'unsupported'
  ))
  const reminderAudioContextRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (mediaArchiveUrlRef.current) URL.revokeObjectURL(mediaArchiveUrlRef.current)
    }
  }, [])

  useEffect(() => {
    if (!supabase) {
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let ignore = false

    Promise.resolve().then(() => {
      if (ignore) return

      if (!session) {
        setOwners([])
        setSeekers([])
        setAppointments([])
        setDataLoading(false)
        return
      }

      setDataLoading(true)
      setStatusMessage('')

      fetchCrmData()
        .then((data) => {
          if (ignore) return
          setOwners(data.owners)
          setSeekers(data.seekers)
          setAppointments(data.appointments)
        })
        .catch((error) => {
          if (!ignore) setStatusMessage(getCrmErrorMessage(error))
        })
        .finally(() => {
          if (!ignore) setDataLoading(false)
        })
    })

    return () => {
      ignore = true
    }
  }, [session])

  const today = initialClock.today
  const now = currentTime
  const reminderLeadMs = reminderLeadMinutes * 60000

  const liveAppointments = appointments.filter((appointment) => isLiveAppointment(appointment.status))
  const todaysAppointments = liveAppointments
    .filter((appointment) => appointment.date === today)
    .sort((first, second) => appointmentStart(first) - appointmentStart(second))
  const overdueAppointments = liveAppointments.filter((appointment) => appointmentEnd(appointment) < now)
  const upcomingAppointments = liveAppointments
    .filter((appointment) => appointmentEnd(appointment) >= now)
    .sort((first, second) => appointmentStart(first) - appointmentStart(second))
  const dueAppointment = liveAppointments
    .filter((appointment) => appointmentStart(appointment) - reminderLeadMs <= now)
    .sort((first, second) => appointmentStart(first) - appointmentStart(second))[0]

  useEffect(() => {
    if (!dueAppointment) return

    playReminderTone(reminderAudioContextRef)
    const timer = window.setInterval(() => playReminderTone(reminderAudioContextRef), 12000)
    return () => window.clearInterval(timer)
  }, [dueAppointment])

  useEffect(() => {
    if (!dueAppointment || notificationPermission !== 'granted') return

    const notify = () => {
      const minutesUntil = minutesUntilAppointment(dueAppointment)
      void showReminderNotification(dueAppointment, minutesUntil)
    }

    notify()
    const timer = window.setInterval(notify, 60000)
    return () => window.clearInterval(timer)
  }, [dueAppointment, notificationPermission])

  const conflictGroups = appointments.filter((appointment) => findAppointmentConflicts(appointment, appointments).length > 0)
  const currentAppointmentConflicts = findAppointmentConflicts(
    { ...appointmentForm, id: editingAppointmentId ?? undefined },
    appointments,
  )

  const visibleOwners = owners.filter((owner) => matchesSearch(ownerSearchText(owner), ownerSearch))
  const visibleSeekers = seekers.filter((seeker) => matchesSearch(seekerSearchText(seeker), seekerSearch))
  const visibleAppointments = appointments
    .filter((appointment) => matchesSearch(appointmentSearchText(appointment), appointmentSearch))
    .sort((first, second) => appointmentStart(first) - appointmentStart(second))
  const selectedOwner = owners.find((owner) => owner.id === selectedOwnerId) ?? null
  const selectedCoverMedia = selectedOwner?.media.find((media) => media.mediaKind === 'image') ?? selectedOwner?.media[0]
  const aiContext = useMemo(() => ({ owners, seekers, appointments }), [owners, seekers, appointments])
  const visibleAiResults = aiResults.filter((result) => {
    if (result.kind === 'owner') return owners.some((owner) => owner.id === result.id)
    if (result.kind === 'seeker') return seekers.some((seeker) => seeker.id === result.id)
    return appointments.some((appointment) => appointment.id === result.id)
  })

  const linkedClientOptions = useMemo(
    () => [
      ...owners.map((owner) => ({
        value: `owner:${owner.id}`,
        label: `مالك | ${owner.ownerName || 'بدون اسم'} | ${owner.propertyType} ${owner.listingIntent}`,
        name: owner.ownerName,
        phone: owner.phone || owner.whatsapp,
        kind: 'owner' as ClientKind,
      })),
      ...seekers.map((seeker) => ({
        value: `seeker:${seeker.id}`,
        label: `طالب | ${seeker.name || 'بدون اسم'} | ${seeker.requestIntent} ${seeker.propertyType}`,
        name: seeker.name,
        phone: seeker.phone,
        kind: 'seeker' as ClientKind,
      })),
    ],
    [owners, seekers],
  )

  const updateOwnerForm = (field: keyof OwnerForm, value: string) => {
    setOwnerForm((current) => ({ ...current, [field]: value }))
  }

  const updateOwnerFiles = (files: FileList | null) => {
    setOwnerFiles(files ? Array.from(files) : [])
  }

  const updateSeekerForm = (field: keyof SeekerForm, value: string) => {
    setSeekerForm((current) => ({ ...current, [field]: value }))
  }

  const updateAppointmentForm = (field: keyof AppointmentForm, value: string) => {
    setAppointmentForm((current) => ({ ...current, [field]: value }))
  }

  const updateAiSettings = (field: keyof AiSettings, value: string) => {
    setAiSettings((current) => ({ ...current, [field]: field === 'provider' && isAiProvider(value) ? value : value }))
  }

  const updateAiFiles = (files: FileList | null) => {
    setAiFiles(files ? Array.from(files) : [])
  }

  const saveAiSettings = async () => {
    localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(aiSettings))
    setAiStatus('تم حفظ إعدادات الذكاء الصناعي على هذا الجهاز.')
    if (aiSettings.apiKey.trim()) await loadAiModels()
  }

  const loadAiModels = async () => {
    setAiLoading(true)
    setAiStatus('')

    try {
      const models = await fetchAiModels(aiSettings)
      setAiModels(models)
      if (!aiSettings.model && models[0]) setAiSettings((current) => ({ ...current, model: models[0].id }))
      setAiStatus(`تم جلب ${numberFormatter.format(models.length)} نموذج.`)
    } catch (error) {
      setAiStatus(getCrmErrorMessage(error))
    } finally {
      setAiLoading(false)
    }
  }

  const updateReminderLead = (value: string) => {
    const nextValue = Math.min(1440, Math.max(0, Number(value) || 0))
    setReminderLeadMinutes(nextValue)
    localStorage.setItem(REMINDER_LEAD_STORAGE_KEY, String(nextValue))
  }

  const enableReminderAlerts = async () => {
    playReminderTone(reminderAudioContextRef)

    if (!('Notification' in window)) {
      setNotificationPermission('unsupported')
      setStatusMessage('هذا المتصفح لا يدعم إشعارات سطح المكتب، وسيعمل صوت التذكير داخل التطبيق فقط.')
      return
    }

    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
    setStatusMessage(permission === 'granted'
      ? 'تم تفعيل تنبيهات المواعيد والصوت على هذا الجهاز.'
      : 'لم يتم السماح بإشعارات المتصفح. سيبقى التنبيه داخل التطبيق بالصوت عند فتحه.')
  }

  const resetOwnerForm = () => {
    setOwnerForm({ ...emptyOwnerForm })
    setOwnerFiles([])
    setEditingOwnerId(null)
  }

  const resetSeekerForm = () => {
    setSeekerForm({ ...emptySeekerForm })
    setEditingSeekerId(null)
  }

  const resetAppointmentForm = () => {
    setAppointmentForm(makeEmptyAppointmentForm())
    setEditingAppointmentId(null)
  }

  const applyAiOwner = (data: Record<string, string>) => {
    const nextOwner: OwnerForm = {
      propertyCode: aiValue(data, 'propertyCode'),
      ownerName: aiValue(data, 'ownerName'),
      phone: aiValue(data, 'phone'),
      whatsapp: aiValue(data, 'whatsapp'),
      propertyType: pickOption(aiValue(data, 'propertyType'), PROPERTY_TYPES, emptyOwnerForm.propertyType),
      listingIntent: pickOption(aiValue(data, 'listingIntent'), ['بيع', 'إيجار', 'بيع أو إيجار'], emptyOwnerForm.listingIntent),
      buildingName: aiValue(data, 'buildingName'),
      unitNumber: aiValue(data, 'unitNumber'),
      city: aiValue(data, 'city'),
      district: aiValue(data, 'district'),
      address: aiValue(data, 'address'),
      price: aiValue(data, 'price'),
      area: aiValue(data, 'area'),
      bedrooms: aiValue(data, 'bedrooms'),
      bathrooms: aiValue(data, 'bathrooms'),
      receptionRooms: aiValue(data, 'receptionRooms'),
      floor: aiValue(data, 'floor'),
      finishing: aiValue(data, 'finishing'),
      furnishing: aiValue(data, 'furnishing'),
      viewDescription: aiValue(data, 'viewDescription'),
      licenseStatus: aiValue(data, 'licenseStatus'),
      deliveryDate: aiValue(data, 'deliveryDate'),
      paymentPlan: aiValue(data, 'paymentPlan'),
      amenities: aiValue(data, 'amenities'),
      mapUrl: aiValue(data, 'mapUrl'),
      virtualTourUrl: aiValue(data, 'virtualTourUrl'),
      availability: aiValue(data, 'availability'),
      status: pickOption(aiValue(data, 'status'), OWNER_STATUSES, emptyOwnerForm.status),
      source: aiValue(data, 'source', 'ذكاء صناعي'),
      notes: aiValue(data, 'notes'),
    }

    setOwnerForm(nextOwner)
    setOwnerFiles(aiFiles)
    setEditingOwnerId(null)
    setActiveSection('owners')
    setStatusMessage('تم ملء نموذج المالك والعقار. راجع البيانات ثم اضغط إضافة المالك.')
  }

  const applyAiSeeker = (data: Record<string, string>) => {
    const nextSeeker: SeekerForm = {
      name: aiValue(data, 'name'),
      phone: aiValue(data, 'phone'),
      requestIntent: pickOption(aiValue(data, 'requestIntent'), ['شراء', 'إيجار', 'شراء أو إيجار'], emptySeekerForm.requestIntent),
      propertyType: pickOption(aiValue(data, 'propertyType'), PROPERTY_TYPES, emptySeekerForm.propertyType),
      city: aiValue(data, 'city'),
      preferredAreas: aiValue(data, 'preferredAreas'),
      budget: aiValue(data, 'budget'),
      paymentMethod: aiValue(data, 'paymentMethod'),
      urgency: pickOption(aiValue(data, 'urgency'), ['عادي', 'قريب', 'عاجل'], emptySeekerForm.urgency),
      status: pickOption(aiValue(data, 'status'), SEEKER_STATUSES, emptySeekerForm.status),
      details: aiValue(data, 'details', aiInput.trim()),
      notes: aiValue(data, 'notes'),
    }

    setSeekerForm(nextSeeker)
    setEditingSeekerId(null)
    setActiveSection('seekers')
    setStatusMessage('تم ملء نموذج العميل الطالب. راجع البيانات ثم اضغط إضافة العميل.')
  }

  const applyAiAppointment = (data: Record<string, string>) => {
    const clientKind = pickOption(aiValue(data, 'clientKind'), ['owner', 'seeker', 'general'], 'general')
    const nextAppointment: AppointmentForm = {
      title: aiValue(data, 'title'),
      appointmentType: pickOption(aiValue(data, 'appointmentType'), APPOINTMENT_TYPES, 'معاينة'),
      clientKind,
      linkedClientId: aiValue(data, 'linkedClientId'),
      clientName: aiValue(data, 'clientName'),
      phone: aiValue(data, 'phone'),
      date: normalizeDateInput(aiValue(data, 'date'), today),
      time: normalizeTimeInput(aiValue(data, 'time')),
      durationMinutes: aiValue(data, 'durationMinutes', '60'),
      location: aiValue(data, 'location'),
      status: pickOption(aiValue(data, 'status'), APPOINTMENT_STATUSES, 'مؤكد'),
      notes: aiValue(data, 'notes'),
    }

    setAppointmentForm(nextAppointment)
    setEditingAppointmentId(null)
    setActiveSection('appointments')
    setStatusMessage('تم ملء نموذج الموعد. راجع التعارضات ثم اضغط إضافة الموعد.')
  }

  const fillFormWithAi = async () => {
    setAiLoading(true)
    setAiStatus('')

    try {
      const result = await extractCrmForm(aiSettings, aiTarget, aiInput, aiTarget === 'owner' ? aiFiles : [], today)
      if (aiTarget === 'owner') applyAiOwner(result.data)
      if (aiTarget === 'seeker') applyAiSeeker(result.data)
      if (aiTarget === 'appointment') applyAiAppointment(result.data)
      setAiStatus(result.summary)
    } catch (error) {
      setAiStatus(getCrmErrorMessage(error))
    } finally {
      setAiLoading(false)
    }
  }

  const askAndSearchAi = async () => {
    setAiLoading(true)
    setAiStatus('')
    setAiAnswer('')

    try {
      const results = rankCrmRecords(aiQuestion, aiContext)
      setAiResults(results)

      if (aiSettings.apiKey.trim() && aiSettings.model.trim()) {
        setAiAnswer(await askCrmAssistant(aiSettings, aiQuestion, aiContext, results))
      } else {
        setAiAnswer('تم تشغيل البحث المحلي. أضف مفتاح ونموذج ذكاء صناعي للحصول على رد تحليلي ودردشة أذكى.')
      }
    } catch (error) {
      setAiStatus(getCrmErrorMessage(error))
    } finally {
      setAiLoading(false)
    }
  }

  const openAiSearchResult = (result: AiSearchResult) => {
    if (result.kind === 'owner') {
      const owner = owners.find((item) => item.id === result.id)
      if (owner) openOwnerDetails(owner)
      return
    }

    if (result.kind === 'seeker') {
      const seeker = seekers.find((item) => item.id === result.id)
      setSeekerSearch(seeker?.name || result.title)
      setActiveSection('seekers')
      return
    }

    const appointment = appointments.find((item) => item.id === result.id)
    setAppointmentSearch(appointment?.title || appointment?.clientName || result.title)
    setActiveSection('appointments')
  }

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return

    setAuthLoading(true)
    setStatusMessage('')

    const result = authMode === 'signin'
      ? await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
      : await supabase.auth.signUp({ email: authEmail, password: authPassword })

    if (result.error) {
      setStatusMessage(result.error.message)
    } else if (authMode === 'signup' && !result.data.session) {
      setStatusMessage('تم إنشاء الحساب. إذا كان تأكيد البريد مفعّلًا، افتح بريدك لتأكيد الحساب ثم سجل الدخول.')
    } else {
      setStatusMessage('تم تسجيل الدخول وتحميل بياناتك.')
    }

    setAuthLoading(false)
  }

  const signOut = async () => {
    await supabase?.auth.signOut()
    setOwners([])
    setSeekers([])
    setAppointments([])
    setStatusMessage('تم تسجيل الخروج.')
  }

  const saveOwner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSaving(true)
    setStatusMessage('')

    try {
      if (editingOwnerId) {
        const savedOwner = await updatePropertyOwner(editingOwnerId, ownerForm)
        const uploadedMedia = await uploadPropertyMedia(savedOwner.id, ownerFiles)
        setOwners((current) => current.map((owner) => (
          owner.id === editingOwnerId ? { ...savedOwner, media: [...uploadedMedia, ...owner.media] } : owner
        )))
      } else {
        const savedOwner = await createPropertyOwner(ownerForm)
        const uploadedMedia = await uploadPropertyMedia(savedOwner.id, ownerFiles)
        setOwners((current) => [{ ...savedOwner, media: uploadedMedia }, ...current])
      }

      resetOwnerForm()
    } catch (error) {
      setStatusMessage(getCrmErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  const saveSeeker = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSaving(true)
    setStatusMessage('')

    try {
      if (editingSeekerId) {
        const savedSeeker = await updateDemandClient(editingSeekerId, seekerForm)
        setSeekers((current) => current.map((seeker) => (seeker.id === editingSeekerId ? savedSeeker : seeker)))
      } else {
        const savedSeeker = await createDemandClient(seekerForm)
        setSeekers((current) => [savedSeeker, ...current])
      }

      resetSeekerForm()
    } catch (error) {
      setStatusMessage(getCrmErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  const saveAppointment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (currentAppointmentConflicts.length > 0) {
      window.alert('يوجد ميعاد آخر داخل نفس التوقيت. عدّل الوقت أو المدة قبل الحفظ.')
      return
    }

    setIsSaving(true)
    setStatusMessage('')

    try {
      if (editingAppointmentId) {
        const savedAppointment = await updateAppointmentRecord(editingAppointmentId, appointmentForm)
        setAppointments((current) =>
          current.map((appointment) => (appointment.id === editingAppointmentId ? savedAppointment : appointment)),
        )
      } else {
        const savedAppointment = await createAppointmentRecord(appointmentForm)
        setAppointments((current) => [savedAppointment, ...current])
      }

      resetAppointmentForm()
    } catch (error) {
      setStatusMessage(getCrmErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  const editOwner = (owner: PropertyOwner) => {
    setOwnerForm(ownerToForm(owner))
    setEditingOwnerId(owner.id)
    setSelectedOwnerId(null)
    setActiveSection('owners')
  }

  const openOwnerDetails = (owner: PropertyOwner) => {
    setSelectedOwnerId(owner.id)
    setActiveSection('propertyDetail')
  }

  const backToOwners = () => {
    setSelectedOwnerId(null)
    setActiveSection('owners')
  }

  const downloadOwnerMedia = async (owner: PropertyOwner) => {
    if (owner.media.length === 0) {
      setStatusMessage('لا توجد صور أو فيديوهات لتحميلها لهذا العقار.')
      return
    }

    setDownloadingOwnerId(owner.id)
    setStatusMessage('')

    try {
      const zip = new JSZip()

      for (const [index, media] of owner.media.entries()) {
        const response = await fetch(media.publicUrl)
        if (!response.ok) throw new Error(`تعذر تحميل الملف: ${media.fileName}`)
        zip.file(`${index + 1}-${safeDownloadName(media.fileName)}`, await response.blob())
      }

      const archiveName = `${safeDownloadName(owner.propertyCode || owner.ownerName || owner.id)}-media.zip`
      const archiveUrl = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }))
      const anchor = document.createElement('a')
      anchor.href = archiveUrl
      anchor.download = archiveName
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      if (mediaArchiveUrlRef.current) URL.revokeObjectURL(mediaArchiveUrlRef.current)
      mediaArchiveUrlRef.current = archiveUrl
      setMediaArchive({ ownerId: owner.id, url: archiveUrl, name: archiveName })
    } catch (error) {
      setStatusMessage(getCrmErrorMessage(error))
    } finally {
      setDownloadingOwnerId(null)
    }
  }

  const editSeeker = (seeker: DemandClient) => {
    setSeekerForm(seekerToForm(seeker))
    setEditingSeekerId(seeker.id)
    setActiveSection('seekers')
  }

  const editAppointment = (appointment: Appointment) => {
    setAppointmentForm(appointmentToForm(appointment))
    setEditingAppointmentId(appointment.id)
    setActiveSection('appointments')
  }

  const deleteOwner = async (id: string) => {
    if (window.confirm('هل تريد حذف هذا العقار وبيانات مالكه؟')) {
      setIsSaving(true)
      setStatusMessage('')

      try {
        await deletePropertyOwnerAndAppointments(id)
        setOwners((current) => current.filter((owner) => owner.id !== id))
        setAppointments((current) => current.filter((appointment) => appointment.linkedClientId !== id))
        if (selectedOwnerId === id) backToOwners()
      } catch (error) {
        setStatusMessage(getCrmErrorMessage(error))
      } finally {
        setIsSaving(false)
      }
    }
  }

  const deleteOwnerMedia = async (media: PropertyMedia) => {
    if (!window.confirm('هل تريد حذف هذا الملف من العقار؟')) return

    setIsSaving(true)
    setStatusMessage('')

    try {
      await deletePropertyMediaRecord(media)
      setOwners((current) => current.map((owner) => (
        owner.id === media.ownerId ? { ...owner, media: owner.media.filter((item) => item.id !== media.id) } : owner
      )))
    } catch (error) {
      setStatusMessage(getCrmErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  const deleteSeeker = async (id: string) => {
    if (window.confirm('هل تريد حذف بيانات هذا العميل؟')) {
      setIsSaving(true)
      setStatusMessage('')

      try {
        await deleteDemandClientAndAppointments(id)
        setSeekers((current) => current.filter((seeker) => seeker.id !== id))
        setAppointments((current) => current.filter((appointment) => appointment.linkedClientId !== id))
      } catch (error) {
        setStatusMessage(getCrmErrorMessage(error))
      } finally {
        setIsSaving(false)
      }
    }
  }

  const deleteAppointment = async (id: string) => {
    if (window.confirm('هل تريد حذف هذا الموعد؟')) {
      setIsSaving(true)
      setStatusMessage('')

      try {
        await deleteAppointmentRecord(id)
        setAppointments((current) => current.filter((appointment) => appointment.id !== id))
      } catch (error) {
        setStatusMessage(getCrmErrorMessage(error))
      } finally {
        setIsSaving(false)
      }
    }
  }

  const completeAppointment = async (appointment: Appointment) => {
    setIsSaving(true)
    setStatusMessage('')

    try {
      const savedAppointment = await updateAppointmentRecord(appointment.id, appointmentToForm({ ...appointment, status: 'تم' }))
      setAppointments((current) => current.map((item) => (item.id === appointment.id ? savedAppointment : item)))
    } catch (error) {
      setStatusMessage(getCrmErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  const selectLinkedClient = (value: string) => {
    const option = linkedClientOptions.find((client) => client.value === value)

    if (!option) {
      setAppointmentForm((current) => ({ ...current, clientKind: 'general', linkedClientId: '', clientName: '', phone: '' }))
      return
    }

    const [, linkedClientId] = value.split(':')
    setAppointmentForm((current) => ({
      ...current,
      clientKind: option.kind,
      linkedClientId,
      clientName: option.name,
      phone: option.phone,
    }))
  }

  const addAppointmentForOwner = (owner: PropertyOwner) => {
    setAppointmentForm({
      ...makeEmptyAppointmentForm(),
      clientKind: 'owner',
      linkedClientId: owner.id,
      clientName: owner.ownerName,
      phone: owner.phone || owner.whatsapp,
      title: `معاينة ${owner.propertyType} ${owner.listingIntent}`,
      location: [owner.city, owner.district, owner.address].filter(Boolean).join(' - '),
    })
    setEditingAppointmentId(null)
    setActiveSection('appointments')
  }

  const addAppointmentForSeeker = (seeker: DemandClient) => {
    setAppointmentForm({
      ...makeEmptyAppointmentForm(),
      clientKind: 'seeker',
      linkedClientId: seeker.id,
      clientName: seeker.name,
      phone: seeker.phone,
      title: `متابعة طلب ${seeker.requestIntent}`,
      location: [seeker.city, seeker.preferredAreas].filter(Boolean).join(' - '),
    })
    setEditingAppointmentId(null)
    setActiveSection('appointments')
  }

  const stats = [
    { label: 'عقارات مسجلة', value: owners.length, tone: 'green' },
    { label: 'طالبين شراء أو إيجار', value: seekers.length, tone: 'blue' },
    { label: 'مواعيد اليوم', value: todaysAppointments.length, tone: 'amber' },
    { label: 'تنبيهات التعارض', value: conflictGroups.length, tone: 'red' },
  ]

  if (!isSupabaseConfigured) {
    return (
      <div className="auth-shell">
        <section className="auth-panel">
          <p className="eyebrow">إعداد الاتصال</p>
          <h1>اتصال Supabase غير مضبوط.</h1>
          <p>تأكد من وجود ملف .env.local وفيه قيم VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY.</p>
        </section>
      </div>
    )
  }

  if (authLoading && !session) {
    return (
      <div className="auth-shell">
        <section className="auth-panel">
          <p className="eyebrow">جار التحميل</p>
          <h1>يتم تجهيز الاتصال الآمن...</h1>
        </section>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="auth-shell">
        <form className="auth-panel" onSubmit={handleAuth}>
          <p className="eyebrow">دخول آمن</p>
          <h1>ادخل إلى نظام العملاء العقاريين.</h1>
          <p>سجل بنفس البريد من أي جهاز أو موبايل وستظهر بياناتك من Supabase.</p>
          <div className="auth-mode">
            <button type="button" className={authMode === 'signin' ? 'is-active' : ''} onClick={() => setAuthMode('signin')}>
              تسجيل دخول
            </button>
            <button type="button" className={authMode === 'signup' ? 'is-active' : ''} onClick={() => setAuthMode('signup')}>
              حساب جديد
            </button>
          </div>
          <label>
            البريد الإلكتروني
            <input required type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} />
          </label>
          <label>
            كلمة المرور
            <input required minLength={6} type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} />
          </label>
          {statusMessage && <div className="sync-banner danger">{statusMessage}</div>}
          <button type="submit" className="primary-action" disabled={authLoading}>
            {authMode === 'signin' ? 'دخول' : 'إنشاء الحساب'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">نظام إدارة تسويق عقاري</p>
          <h1>كل عميل، كل عقار، وكل ميعاد في مكان واحد.</h1>
          <p className="header-copy">
            سجل الملاك، طلبات الشراء والإيجار، المعاينات والمتابعات مع منع تعارض المواعيد تلقائيًا.
          </p>
        </div>
        <div className="header-actions" aria-label="إجراءات سريعة">
          <button type="button" className="primary-action" onClick={() => setActiveSection('ai')}>
            الذكاء الصناعي
          </button>
          <button type="button" className="primary-action" onClick={() => setActiveSection('owners')}>
            إضافة عقار
          </button>
          <button type="button" className="secondary-action" onClick={() => setActiveSection('seekers')}>
            إضافة طالب
          </button>
          <button type="button" className="secondary-action" onClick={() => setActiveSection('appointments')}>
            ميعاد جديد
          </button>
          <button type="button" className="secondary-action" onClick={signOut}>
            تسجيل خروج
          </button>
        </div>
      </header>

      <div className="sync-strip" aria-live="polite">
        <span>{session.user.email}</span>
        {dataLoading && <strong>جار تحميل البيانات من Supabase...</strong>}
        {isSaving && <strong>جار حفظ التغييرات...</strong>}
        {statusMessage && <strong className="danger-text">{statusMessage}</strong>}
      </div>

      {dueAppointment && (
        <div className="reminder-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="appointment-reminder-title">
          <section className="reminder-card">
            <p className="eyebrow">تنبيه موعد متكرر</p>
            <h2 id="appointment-reminder-title">{dueAppointment.title || dueAppointment.appointmentType}</h2>
            <p>
              {dueAppointment.clientName || 'بدون عميل'} - {formatDate(dueAppointment.date)} الساعة {dueAppointment.time} - {' '}
              {minutesUntilAppointment(dueAppointment) > 0 ? `متبقّي ${numberFormatter.format(minutesUntilAppointment(dueAppointment))} دقيقة` : 'الموعد بدأ أو متأخر'}
            </p>
            <div className="meta-line">
              <span>{dueAppointment.location || 'مكان غير محدد'}</span>
              <span>{readDurationMinutes(dueAppointment.durationMinutes)} دقيقة</span>
              <span>{dueAppointment.phone}</span>
              <span>التذكير قبل {numberFormatter.format(reminderLeadMinutes)} دقيقة</span>
            </div>
            <div className="row-actions">
              {phoneHref(dueAppointment.phone) && <a className="primary-action" href={phoneHref(dueAppointment.phone)}>اتصال</a>}
              {whatsappHref(dueAppointment.phone) && <a className="text-action" href={whatsappHref(dueAppointment.phone)} target="_blank" rel="noreferrer">واتساب</a>}
              <button type="button" className="secondary-action" onClick={() => editAppointment(dueAppointment)}>تعديل الموعد</button>
              <button type="button" className="primary-action" onClick={() => completeAppointment(dueAppointment)} disabled={isSaving}>تمت المتابعة</button>
            </div>
          </section>
        </div>
      )}

      <nav className="section-tabs" aria-label="أقسام النظام">
        {[
          ['dashboard', 'لوحة اليوم'],
          ['owners', 'الملاك والعقارات'],
          ['seekers', 'طلبات العملاء'],
          ['appointments', 'المواعيد والمعاينات'],
          ['ai', 'الذكاء الصناعي'],
        ].map(([section, label]) => (
          <button
            key={section}
            type="button"
            className={activeSection === section ? 'is-active' : ''}
            onClick={() => setActiveSection(section as ActiveSection)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main>
        {activeSection === 'dashboard' && (
          <section className="dashboard-grid" aria-label="لوحة اليوم">
            <div className="stats-strip">
              {stats.map((stat) => (
                <article className={`stat-card ${stat.tone}`} key={stat.label}>
                  <span>{stat.label}</span>
                  <strong>{numberFormatter.format(stat.value)}</strong>
                </article>
              ))}
            </div>

            <section className="today-panel">
              <div className="section-heading">
                <p className="eyebrow">جدول اليوم</p>
                <h2>{formatDate(today)}</h2>
              </div>
              <div className="timeline-list">
                {todaysAppointments.length === 0 && <p className="empty-state">لا توجد مواعيد مسجلة اليوم.</p>}
                {todaysAppointments.map((appointment) => (
                  <article className="timeline-item" key={appointment.id}>
                    <time>{appointment.time}</time>
                    <div>
                      <strong>{appointment.title || appointment.appointmentType}</strong>
                      <span>
                        {appointment.clientName || 'بدون عميل'} - {appointment.location || 'بدون مكان'}
                      </span>
                    </div>
                    <button type="button" className="text-action" onClick={() => editAppointment(appointment)}>
                      تعديل
                    </button>
                  </article>
                ))}
              </div>
            </section>

            <section className="alerts-panel">
              <div className="section-heading">
                <p className="eyebrow">تنبيهات</p>
                <h2>المتابعات القادمة</h2>
              </div>
              <div className="alert-list">
                {overdueAppointments.length > 0 && (
                  <div className="alert-row danger">
                    <strong>{numberFormatter.format(overdueAppointments.length)} موعد متأخر</strong>
                    <span>راجع المواعيد التي انتهى وقتها ولم يتم إغلاقها.</span>
                  </div>
                )}
                {conflictGroups.length > 0 && (
                  <div className="alert-row danger">
                    <strong>{numberFormatter.format(conflictGroups.length)} تعارض في المواعيد</strong>
                    <span>يوجد أكثر من ميعاد داخل نفس الفترة الزمنية.</span>
                  </div>
                )}
                {upcomingAppointments.slice(0, 5).map((appointment) => (
                  <div className="alert-row" key={appointment.id}>
                    <strong>{appointment.title || appointment.appointmentType}</strong>
                    <span>
                      {formatDate(appointment.date)} - {appointment.time} - {appointment.clientName || 'بدون عميل'}
                    </span>
                  </div>
                ))}
                {overdueAppointments.length === 0 && conflictGroups.length === 0 && upcomingAppointments.length === 0 && (
                  <p className="empty-state">لا توجد تنبيهات أو مواعيد قادمة.</p>
                )}
              </div>
            </section>

            <section className="latest-panel">
              <div className="section-heading">
                <p className="eyebrow">آخر الإضافات</p>
                <h2>عملاء يحتاجون متابعة</h2>
              </div>
              <div className="mini-grid">
                {[...owners.slice(0, 3), ...seekers.slice(0, 3)].length === 0 && (
                  <p className="empty-state">ابدأ بإضافة عقار أو عميل طالب.</p>
                )}
                {owners.slice(0, 3).map((owner) => (
                  <article className="mini-record" key={owner.id}>
                    <span>مالك</span>
                    <strong>{owner.ownerName || 'بدون اسم'}</strong>
                    <small>{owner.propertyType} - {owner.listingIntent}</small>
                    <button type="button" className="text-action" onClick={() => addAppointmentForOwner(owner)}>
                      ميعاد
                    </button>
                  </article>
                ))}
                {seekers.slice(0, 3).map((seeker) => (
                  <article className="mini-record" key={seeker.id}>
                    <span>طالب</span>
                    <strong>{seeker.name || 'بدون اسم'}</strong>
                    <small>{seeker.requestIntent} - {seeker.propertyType}</small>
                    <button type="button" className="text-action" onClick={() => addAppointmentForSeeker(seeker)}>
                      ميعاد
                    </button>
                  </article>
                ))}
              </div>
            </section>
          </section>
        )}

        {activeSection === 'ai' && (
          <section className="ai-workspace" aria-label="إعدادات ومساعد الذكاء الصناعي">
            <section className="ai-hero-panel">
              <div>
                <p className="eyebrow">مساعد ذكي</p>
                <h2>اقرأ النص والصور، املأ النماذج، وابحث داخل كل بياناتك.</h2>
              </div>
              <div className="ai-quick-stats" aria-label="ملخص بيانات الذكاء">
                <span>{numberFormatter.format(owners.length)} عقار</span>
                <span>{numberFormatter.format(seekers.length)} طلب</span>
                <span>{numberFormatter.format(appointments.length)} موعد</span>
              </div>
            </section>

            <div className="ai-grid">
              <section className="ai-panel">
                <div className="section-heading compact-heading">
                  <p className="eyebrow">إعدادات الذكاء الصناعي</p>
                  <h2>المزود والنموذج</h2>
                </div>
                <div className="form-grid single-grid">
                  <label>
                    المزود
                    <select value={aiSettings.provider} onChange={(event) => updateAiSettings('provider', event.target.value)}>
                      {Object.entries(AI_PROVIDER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>
                    مفتاح API
                    <input type="password" value={aiSettings.apiKey} onChange={(event) => updateAiSettings('apiKey', event.target.value)} placeholder="Gemini أو OpenRouter أو مفتاح متوافق" />
                  </label>
                  {aiSettings.provider === 'custom' && (
                    <label>
                      رابط المزود
                      <input inputMode="url" value={aiSettings.customBaseUrl} onChange={(event) => updateAiSettings('customBaseUrl', event.target.value)} placeholder="https://api.openai.com/v1" />
                    </label>
                  )}
                  <label>
                    النموذج
                    <input list="ai-model-list" value={aiSettings.model} onChange={(event) => updateAiSettings('model', event.target.value)} placeholder="اختر أو اكتب اسم النموذج" />
                    <datalist id="ai-model-list">
                      {aiModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
                    </datalist>
                  </label>
                </div>
                <div className="form-actions">
                  <button type="button" className="primary-action" onClick={saveAiSettings}>حفظ الإعدادات</button>
                  <button type="button" className="secondary-action" onClick={loadAiModels} disabled={aiLoading}>جلب النماذج</button>
                </div>
                <p className="field-hint">يتم حفظ المفتاح داخل متصفحك فقط، ولا يتم رفعه إلى قاعدة البيانات.</p>
                {aiStatus && <div className="sync-banner ai-status">{aiStatus}</div>}
              </section>

              <section className="ai-panel ai-main-panel">
                <div className="section-heading compact-heading">
                  <p className="eyebrow">تعبئة تلقائية</p>
                  <h2>تحويل النص إلى سجل جاهز</h2>
                </div>
                <div className="ai-target-tabs" aria-label="نوع السجل المطلوب">
                  {(Object.keys(AI_TARGET_LABELS) as AiFormTarget[]).map((target) => (
                    <button key={target} type="button" className={aiTarget === target ? 'is-active' : ''} onClick={() => setAiTarget(target)}>
                      {AI_TARGET_LABELS[target]}
                    </button>
                  ))}
                </div>
                <label>
                  النص الكامل
                  <textarea className="ai-textarea" value={aiInput} onChange={(event) => setAiInput(event.target.value)} placeholder="الصق رسالة العميل أو وصف العقار بكل التفاصيل..." />
                </label>
                {aiTarget === 'owner' && (
                  <label>
                    صور العقار
                    <input type="file" multiple accept="image/*" onChange={(event) => updateAiFiles(event.target.files)} />
                    <span className="field-hint">الصور المختارة هنا ستضاف تلقائيًا إلى نموذج المالك بعد التحليل.</span>
                  </label>
                )}
                {aiTarget === 'owner' && aiFiles.length > 0 && (
                  <div className="selected-files">
                    {aiFiles.map((file) => <span key={`${file.name}-${file.size}`}>{file.name} - {fileSizeLabel(file.size)}</span>)}
                  </div>
                )}
                <div className="form-actions">
                  <button type="button" className="primary-action" onClick={fillFormWithAi} disabled={aiLoading}>
                    {aiLoading ? 'جار التحليل...' : 'حلل واملأ النموذج'}
                  </button>
                  <button type="button" className="secondary-action" onClick={() => setAiInput('')}>مسح النص</button>
                </div>
              </section>

              <section className="ai-panel ai-main-panel">
                <div className="section-heading compact-heading">
                  <p className="eyebrow">بحث ودردشة</p>
                  <h2>اسأل عن العقارات والعملاء والمواعيد</h2>
                </div>
                <label>
                  سؤالك
                  <textarea className="ai-question" value={aiQuestion} onChange={(event) => setAiQuestion(event.target.value)} placeholder="مثال: هات شقق إيجار في التجمع بسعر قريب من مليون، أو مواعيد اليوم" />
                </label>
                <div className="form-actions">
                  <button type="button" className="primary-action" onClick={askAndSearchAi} disabled={aiLoading}>اسأل وابحث</button>
                </div>
                {aiAnswer && (
                  <div className="ai-answer">
                    {aiAnswer.split('\n').filter((line) => line.trim()).map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                )}
                <div className="ai-result-list">
                  {visibleAiResults.length > 0 && <h3 className="ai-results-title">نتائج قابلة للفتح</h3>}
                  {visibleAiResults.map((result) => (
                    <article className="ai-result-card" key={`${result.kind}-${result.id}`}>
                      <span className="status-pill blue-pill">{SEARCH_KIND_LABELS[result.kind]}</span>
                      <h3>{result.title}</h3>
                      <p>{result.subtitle}</p>
                      <small>{result.details}</small>
                      <button type="button" className="text-action" onClick={() => openAiSearchResult(result)}>فتح</button>
                    </article>
                  ))}
                  {aiQuestion && visibleAiResults.length === 0 && !aiLoading && <p className="empty-state">لا توجد نتائج محلية مطابقة حتى الآن.</p>}
                </div>
              </section>
            </div>
          </section>
        )}

        {activeSection === 'owners' && (
          <section className="workspace-grid" aria-label="الملاك والعقارات">
            <form className="form-panel" onSubmit={saveOwner}>
              <div className="section-heading">
                <p className="eyebrow">قسم العقارات</p>
                <h2>{editingOwnerId ? 'تعديل بيانات عقار' : 'إضافة عقار وبيانات مالكه'}</h2>
              </div>
              <div className="form-grid">
                <label>
                  اسم المالك
                  <input required value={ownerForm.ownerName} onChange={(event) => updateOwnerForm('ownerName', event.target.value)} />
                </label>
                <label>
                  رقم الهاتف
                  <input required inputMode="tel" value={ownerForm.phone} onChange={(event) => updateOwnerForm('phone', event.target.value)} />
                </label>
                <label>
                  واتساب
                  <input inputMode="tel" value={ownerForm.whatsapp} onChange={(event) => updateOwnerForm('whatsapp', event.target.value)} />
                </label>
                <label>
                  كود العقار
                  <input value={ownerForm.propertyCode} onChange={(event) => updateOwnerForm('propertyCode', event.target.value)} />
                </label>
                <label>
                  نوع العقار
                  <select value={ownerForm.propertyType} onChange={(event) => updateOwnerForm('propertyType', event.target.value)}>
                    {PROPERTY_TYPES.map((type) => <option key={type}>{type}</option>)}
                  </select>
                </label>
                <label>
                  العرض
                  <select value={ownerForm.listingIntent} onChange={(event) => updateOwnerForm('listingIntent', event.target.value)}>
                    <option>بيع</option>
                    <option>إيجار</option>
                    <option>بيع أو إيجار</option>
                  </select>
                </label>
                <label>
                  اسم الكمبوند/العمارة
                  <input value={ownerForm.buildingName} onChange={(event) => updateOwnerForm('buildingName', event.target.value)} />
                </label>
                <label>
                  رقم الوحدة
                  <input value={ownerForm.unitNumber} onChange={(event) => updateOwnerForm('unitNumber', event.target.value)} />
                </label>
                <label>
                  المدينة
                  <input value={ownerForm.city} onChange={(event) => updateOwnerForm('city', event.target.value)} />
                </label>
                <label>
                  المنطقة
                  <input value={ownerForm.district} onChange={(event) => updateOwnerForm('district', event.target.value)} />
                </label>
                <label className="wide-field">
                  العنوان التفصيلي
                  <input value={ownerForm.address} onChange={(event) => updateOwnerForm('address', event.target.value)} />
                </label>
                <label>
                  السعر المطلوب
                  <input value={ownerForm.price} onChange={(event) => updateOwnerForm('price', event.target.value)} />
                </label>
                <label>
                  المساحة
                  <input value={ownerForm.area} onChange={(event) => updateOwnerForm('area', event.target.value)} />
                </label>
                <label>
                  الغرف
                  <input value={ownerForm.bedrooms} onChange={(event) => updateOwnerForm('bedrooms', event.target.value)} />
                </label>
                <label>
                  الحمامات
                  <input value={ownerForm.bathrooms} onChange={(event) => updateOwnerForm('bathrooms', event.target.value)} />
                </label>
                <label>
                  الريسبشن/الصالات
                  <input value={ownerForm.receptionRooms} onChange={(event) => updateOwnerForm('receptionRooms', event.target.value)} />
                </label>
                <label>
                  الدور
                  <input value={ownerForm.floor} onChange={(event) => updateOwnerForm('floor', event.target.value)} />
                </label>
                <label>
                  التشطيب
                  <input value={ownerForm.finishing} onChange={(event) => updateOwnerForm('finishing', event.target.value)} />
                </label>
                <label>
                  الفرش
                  <input value={ownerForm.furnishing} onChange={(event) => updateOwnerForm('furnishing', event.target.value)} />
                </label>
                <label>
                  الواجهة/الفيو
                  <input value={ownerForm.viewDescription} onChange={(event) => updateOwnerForm('viewDescription', event.target.value)} />
                </label>
                <label>
                  موقف الترخيص/العقد
                  <input value={ownerForm.licenseStatus} onChange={(event) => updateOwnerForm('licenseStatus', event.target.value)} />
                </label>
                <label>
                  تاريخ التسليم
                  <input value={ownerForm.deliveryDate} onChange={(event) => updateOwnerForm('deliveryDate', event.target.value)} />
                </label>
                <label className="wide-field">
                  طريقة الدفع/التقسيط
                  <input value={ownerForm.paymentPlan} onChange={(event) => updateOwnerForm('paymentPlan', event.target.value)} />
                </label>
                <label className="wide-field">
                  الخدمات والمميزات
                  <textarea value={ownerForm.amenities} onChange={(event) => updateOwnerForm('amenities', event.target.value)} />
                </label>
                <label>
                  رابط الموقع على الخريطة
                  <input inputMode="url" value={ownerForm.mapUrl} onChange={(event) => updateOwnerForm('mapUrl', event.target.value)} />
                </label>
                <label>
                  رابط جولة أو فيديو خارجي
                  <input inputMode="url" value={ownerForm.virtualTourUrl} onChange={(event) => updateOwnerForm('virtualTourUrl', event.target.value)} />
                </label>
                <label>
                  الإتاحة
                  <input value={ownerForm.availability} onChange={(event) => updateOwnerForm('availability', event.target.value)} />
                </label>
                <label>
                  الحالة
                  <select value={ownerForm.status} onChange={(event) => updateOwnerForm('status', event.target.value as OwnerStatus)}>
                    {OWNER_STATUSES.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </label>
                <label>
                  مصدر العميل
                  <input value={ownerForm.source} onChange={(event) => updateOwnerForm('source', event.target.value)} />
                </label>
                <label className="wide-field">
                  ملاحظات
                  <textarea value={ownerForm.notes} onChange={(event) => updateOwnerForm('notes', event.target.value)} />
                </label>
                <label className="wide-field">
                  صور وفيديوهات العقار
                  <input type="file" multiple accept="image/*,video/*" onChange={(event) => updateOwnerFiles(event.target.files)} />
                  <span className="field-hint">يمكن اختيار أكثر من صورة أو فيديو من الكمبيوتر أو الموبايل، بحد 100MB للملف.</span>
                </label>
                {ownerFiles.length > 0 && (
                  <div className="selected-files wide-field">
                    {ownerFiles.map((file) => (
                      <span key={`${file.name}-${file.size}`}>{file.name} - {fileSizeLabel(file.size)}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="form-actions">
                <button type="submit" className="primary-action" disabled={isSaving}>{editingOwnerId ? 'حفظ التعديل' : 'إضافة العقار'}</button>
                {editingOwnerId && <button type="button" className="secondary-action" onClick={resetOwnerForm}>إلغاء</button>}
              </div>
            </form>

            <div className="records-area">
              <div className="section-heading compact-heading">
                <p className="eyebrow">السجلات</p>
                <h2>عقارات الملاك</h2>
              </div>
              <input className="search-input" placeholder="بحث في كل تفاصيل العقار والمالك" value={ownerSearch} onChange={(event) => setOwnerSearch(event.target.value)} />
              <div className="record-list">
                {visibleOwners.length === 0 && <p className="empty-state">لا توجد سجلات مطابقة.</p>}
                {visibleOwners.map((owner) => {
                  const coverMedia = owner.media.find((media) => media.mediaKind === 'image') ?? owner.media[0]

                  return (
                    <article className="property-card" key={owner.id}>
                      <button type="button" className="property-card-main" onClick={() => openOwnerDetails(owner)}>
                        <div className="property-cover">
                          {coverMedia?.mediaKind === 'image' && <img src={coverMedia.publicUrl} alt={owner.ownerName} loading="lazy" />}
                          {coverMedia?.mediaKind === 'video' && <video src={coverMedia.publicUrl} muted preload="metadata" />}
                          {!coverMedia && <span>{owner.propertyType}</span>}
                        </div>
                        <div className="property-card-copy">
                          <span className="status-pill">{owner.status}</span>
                          <h3>{owner.propertyType} {owner.listingIntent}</h3>
                          <p>{owner.city || 'مدينة غير محددة'} - {owner.district || 'منطقة غير محددة'}</p>
                          <div className="property-card-price">{owner.price || 'سعر غير محدد'}</div>
                          <div className="meta-line">
                            {owner.propertyCode && <span>كود {owner.propertyCode}</span>}
                            {owner.area && <span>{owner.area}</span>}
                            {owner.floor && <span>الدور {owner.floor}</span>}
                            {owner.bedrooms && <span>{owner.bedrooms} غرف</span>}
                            {owner.bathrooms && <span>{owner.bathrooms} حمام</span>}
                            <span>{numberFormatter.format(owner.media.length)} وسائط</span>
                          </div>
                        </div>
                      </button>
                    <div className="row-actions">
                      {phoneHref(owner.phone) && <a className="text-action" href={phoneHref(owner.phone)}>اتصال</a>}
                      {whatsappHref(owner.whatsapp || owner.phone) && <a className="text-action" href={whatsappHref(owner.whatsapp || owner.phone)} target="_blank" rel="noreferrer">واتساب</a>}
                      <button type="button" className="text-action" onClick={() => openOwnerDetails(owner)}>تفاصيل</button>
                      <button type="button" className="text-action" onClick={() => addAppointmentForOwner(owner)}>ميعاد</button>
                      <button type="button" className="text-action" onClick={() => editOwner(owner)}>تعديل</button>
                      <button type="button" className="danger-action" onClick={() => deleteOwner(owner.id)}>حذف</button>
                    </div>
                  </article>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {activeSection === 'propertyDetail' && (
          selectedOwner ? (
            <section className="property-detail-page" aria-label="تفاصيل العقار">
              <div className="detail-toolbar">
                <button type="button" className="secondary-action" onClick={backToOwners}>عودة للعقارات</button>
                <button type="button" className="text-action" onClick={() => editOwner(selectedOwner)}>تعديل البيانات</button>
              </div>

              <article className="property-detail-hero">
                <div className="detail-cover">
                  {selectedCoverMedia?.mediaKind === 'image' && <img src={selectedCoverMedia.publicUrl} alt={selectedOwner.ownerName} />}
                  {selectedCoverMedia?.mediaKind === 'video' && <video src={selectedCoverMedia.publicUrl} controls preload="metadata" />}
                  {!selectedCoverMedia && <span>{selectedOwner.propertyType}</span>}
                </div>
                <div className="detail-summary">
                  <span className="status-pill">{selectedOwner.status}</span>
                  <h2>{selectedOwner.propertyType} {selectedOwner.listingIntent}</h2>
                  <p>{selectedOwner.city || 'مدينة غير محددة'} - {selectedOwner.district || 'منطقة غير محددة'} - {selectedOwner.address || 'عنوان غير محدد'}</p>
                  <div className="detail-price">{selectedOwner.price || 'سعر غير محدد'}</div>
                  <div className="meta-line">
                    {selectedOwner.propertyCode && <span>كود {selectedOwner.propertyCode}</span>}
                    {selectedOwner.area && <span>{selectedOwner.area}</span>}
                    {selectedOwner.bedrooms && <span>{selectedOwner.bedrooms} غرف</span>}
                    {selectedOwner.bathrooms && <span>{selectedOwner.bathrooms} حمام</span>}
                    <span>{numberFormatter.format(selectedOwner.media.length)} وسائط</span>
                    <span>أضيف {formatDateTime(selectedOwner.createdAt)}</span>
                  </div>
                  <div className="row-actions detail-actions">
                    <button
                      type="button"
                      className="primary-action"
                      disabled={downloadingOwnerId === selectedOwner.id || selectedOwner.media.length === 0}
                      onClick={() => downloadOwnerMedia(selectedOwner)}
                    >
                      {downloadingOwnerId === selectedOwner.id ? 'جار تجهيز الملف...' : 'تحميل كل الوسائط'}
                    </button>
                    {mediaArchive?.ownerId === selectedOwner.id && (
                      <a className="secondary-action" href={mediaArchive.url} download={mediaArchive.name}>الملف جاهز للتحميل</a>
                    )}
                    {phoneHref(selectedOwner.phone) && <a className="text-action" href={phoneHref(selectedOwner.phone)}>اتصال</a>}
                    {whatsappHref(selectedOwner.whatsapp || selectedOwner.phone) && <a className="text-action" href={whatsappHref(selectedOwner.whatsapp || selectedOwner.phone)} target="_blank" rel="noreferrer">واتساب</a>}
                    <button type="button" className="text-action" onClick={() => addAppointmentForOwner(selectedOwner)}>ميعاد</button>
                  </div>
                </div>
              </article>

              <section className="detail-section">
                <div className="section-heading compact-heading">
                  <p className="eyebrow">بيانات العقار</p>
                  <h2>التفاصيل الكاملة</h2>
                </div>
                <div className="detail-grid">
                  {selectedOwner.ownerName && <span>المالك: {selectedOwner.ownerName}</span>}
                  {selectedOwner.phone && <span>الهاتف: {selectedOwner.phone}</span>}
                  {selectedOwner.whatsapp && <span>واتساب: {selectedOwner.whatsapp}</span>}
                  {selectedOwner.buildingName && <span>المبنى/الكمبوند: {selectedOwner.buildingName}</span>}
                  {selectedOwner.unitNumber && <span>الوحدة: {selectedOwner.unitNumber}</span>}
                  {selectedOwner.floor && <span>الدور: {selectedOwner.floor}</span>}
                  {selectedOwner.receptionRooms && <span>الريسبشن/الصالات: {selectedOwner.receptionRooms}</span>}
                  {selectedOwner.finishing && <span>التشطيب: {selectedOwner.finishing}</span>}
                  {selectedOwner.furnishing && <span>الفرش: {selectedOwner.furnishing}</span>}
                  {selectedOwner.viewDescription && <span>الفيو: {selectedOwner.viewDescription}</span>}
                  {selectedOwner.licenseStatus && <span>الترخيص/العقد: {selectedOwner.licenseStatus}</span>}
                  {selectedOwner.deliveryDate && <span>التسليم: {selectedOwner.deliveryDate}</span>}
                  {selectedOwner.paymentPlan && <span>الدفع: {selectedOwner.paymentPlan}</span>}
                  {selectedOwner.availability && <span>الإتاحة: {selectedOwner.availability}</span>}
                  {selectedOwner.source && <span>المصدر: {selectedOwner.source}</span>}
                  {selectedOwner.amenities && <span className="wide-detail">المميزات: {selectedOwner.amenities}</span>}
                  {selectedOwner.notes && <span className="wide-detail">ملاحظات: {selectedOwner.notes}</span>}
                </div>
                {(selectedOwner.mapUrl || selectedOwner.virtualTourUrl) && (
                  <div className="link-line detail-links">
                    {selectedOwner.mapUrl && <a href={selectedOwner.mapUrl} target="_blank" rel="noreferrer">فتح الخريطة</a>}
                    {selectedOwner.virtualTourUrl && <a href={selectedOwner.virtualTourUrl} target="_blank" rel="noreferrer">فتح الجولة/الفيديو الخارجي</a>}
                  </div>
                )}
              </section>

              <section className="detail-section">
                <div className="section-heading compact-heading">
                  <p className="eyebrow">الوسائط</p>
                  <h2>صور وفيديوهات العقار</h2>
                </div>
                {selectedOwner.media.length === 0 && <p className="empty-state">لم يتم رفع صور أو فيديوهات لهذا العقار بعد.</p>}
                {selectedOwner.media.length > 0 && (
                  <div className="detail-media-grid">
                    {selectedOwner.media.map((media) => (
                      <figure className="detail-media-item" key={media.id}>
                        {media.mediaKind === 'image' && <img src={media.publicUrl} alt={media.fileName} loading="lazy" />}
                        {media.mediaKind === 'video' && <video src={media.publicUrl} controls preload="metadata" />}
                        {media.mediaKind === 'file' && <div className="file-tile">{media.fileName}</div>}
                        <figcaption>
                          <span>{media.fileName}</span>
                          <small>{fileSizeLabel(media.fileSize)}</small>
                        </figcaption>
                        <button type="button" className="danger-action" onClick={() => deleteOwnerMedia(media)}>حذف الملف</button>
                      </figure>
                    ))}
                  </div>
                )}
              </section>
            </section>
          ) : (
            <section className="detail-section">
              <p className="empty-state">لم يتم العثور على العقار المحدد.</p>
              <button type="button" className="secondary-action" onClick={backToOwners}>عودة للعقارات</button>
            </section>
          )
        )}

        {activeSection === 'seekers' && (
          <section className="workspace-grid" aria-label="طلبات العملاء">
            <form className="form-panel" onSubmit={saveSeeker}>
              <div className="section-heading">
                <p className="eyebrow">قسم الطالبين</p>
                <h2>{editingSeekerId ? 'تعديل طلب عميل' : 'إضافة عميل طالب'}</h2>
              </div>
              <div className="form-grid">
                <label>
                  اسم العميل
                  <input required value={seekerForm.name} onChange={(event) => updateSeekerForm('name', event.target.value)} />
                </label>
                <label>
                  رقم الهاتف
                  <input required inputMode="tel" value={seekerForm.phone} onChange={(event) => updateSeekerForm('phone', event.target.value)} />
                </label>
                <label>
                  نوع الطلب
                  <select value={seekerForm.requestIntent} onChange={(event) => updateSeekerForm('requestIntent', event.target.value)}>
                    <option>شراء</option>
                    <option>إيجار</option>
                    <option>شراء أو إيجار</option>
                  </select>
                </label>
                <label>
                  نوع العقار
                  <select value={seekerForm.propertyType} onChange={(event) => updateSeekerForm('propertyType', event.target.value)}>
                    {PROPERTY_TYPES.map((type) => <option key={type}>{type}</option>)}
                  </select>
                </label>
                <label>
                  المدينة
                  <input value={seekerForm.city} onChange={(event) => updateSeekerForm('city', event.target.value)} />
                </label>
                <label>
                  المناطق المطلوبة
                  <input value={seekerForm.preferredAreas} onChange={(event) => updateSeekerForm('preferredAreas', event.target.value)} />
                </label>
                <label>
                  الميزانية
                  <input value={seekerForm.budget} onChange={(event) => updateSeekerForm('budget', event.target.value)} />
                </label>
                <label>
                  طريقة الدفع
                  <input value={seekerForm.paymentMethod} onChange={(event) => updateSeekerForm('paymentMethod', event.target.value)} />
                </label>
                <label>
                  درجة الاستعجال
                  <select value={seekerForm.urgency} onChange={(event) => updateSeekerForm('urgency', event.target.value)}>
                    <option>عادي</option>
                    <option>قريب</option>
                    <option>عاجل</option>
                  </select>
                </label>
                <label>
                  الحالة
                  <select value={seekerForm.status} onChange={(event) => updateSeekerForm('status', event.target.value as SeekerStatus)}>
                    {SEEKER_STATUSES.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </label>
                <label className="wide-field">
                  تفاصيل الطلب
                  <textarea required value={seekerForm.details} onChange={(event) => updateSeekerForm('details', event.target.value)} />
                </label>
                <label className="wide-field">
                  ملاحظات
                  <textarea value={seekerForm.notes} onChange={(event) => updateSeekerForm('notes', event.target.value)} />
                </label>
              </div>
              <div className="form-actions">
                <button type="submit" className="primary-action" disabled={isSaving}>{editingSeekerId ? 'حفظ التعديل' : 'إضافة العميل'}</button>
                {editingSeekerId && <button type="button" className="secondary-action" onClick={resetSeekerForm}>إلغاء</button>}
              </div>
            </form>

            <div className="records-area">
              <div className="section-heading compact-heading">
                <p className="eyebrow">السجلات</p>
                <h2>طلبات الشراء والإيجار</h2>
              </div>
              <input className="search-input" placeholder="بحث باسم، رقم، منطقة، ميزانية" value={seekerSearch} onChange={(event) => setSeekerSearch(event.target.value)} />
              <div className="record-list">
                {visibleSeekers.length === 0 && <p className="empty-state">لا توجد سجلات مطابقة.</p>}
                {visibleSeekers.map((seeker) => (
                  <article className="record-row" key={seeker.id}>
                    <div className="record-main">
                      <span className="status-pill blue-pill">{seeker.status}</span>
                      <h3>{seeker.name}</h3>
                      <p>{seeker.requestIntent} {seeker.propertyType} - {seeker.preferredAreas || seeker.city || 'منطقة غير محددة'}</p>
                      <div className="meta-line">
                        <span>{seeker.phone}</span>
                        <span>{seeker.budget || 'ميزانية غير محددة'}</span>
                        <span>أضيف {formatDateTime(seeker.createdAt)}</span>
                      </div>
                    </div>
                    <div className="row-actions">
                      {phoneHref(seeker.phone) && <a className="text-action" href={phoneHref(seeker.phone)}>اتصال</a>}
                      {whatsappHref(seeker.phone) && <a className="text-action" href={whatsappHref(seeker.phone)} target="_blank" rel="noreferrer">واتساب</a>}
                      <button type="button" className="text-action" onClick={() => addAppointmentForSeeker(seeker)}>ميعاد</button>
                      <button type="button" className="text-action" onClick={() => editSeeker(seeker)}>تعديل</button>
                      <button type="button" className="danger-action" onClick={() => deleteSeeker(seeker.id)}>حذف</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeSection === 'appointments' && (
          <section className="workspace-grid" aria-label="المواعيد والمعاينات">
            <section className="reminder-settings-card">
              <div>
                <p className="eyebrow">إعدادات التذكير</p>
                <h2>تنبيه قبل الموعد بصوت واضح وتكرار حتى اتخاذ إجراء.</h2>
              </div>
              <div className="reminder-controls">
                <label>
                  التذكير قبل الموعد بالدقائق
                  <input min="0" max="1440" step="5" type="number" value={reminderLeadMinutes} onChange={(event) => updateReminderLead(event.target.value)} />
                </label>
                <button type="button" className="primary-action" onClick={enableReminderAlerts}>تفعيل الصوت والتنبيهات</button>
                <span className="field-hint">
                  حالة إشعارات المتصفح: {notificationPermission === 'granted' ? 'مفعلة' : notificationPermission === 'denied' ? 'مرفوضة' : notificationPermission === 'unsupported' ? 'غير مدعومة' : 'لم يتم السماح بعد'}
                </span>
              </div>
            </section>
            <form className="form-panel" onSubmit={saveAppointment}>
              <div className="section-heading">
                <p className="eyebrow">المواعيد</p>
                <h2>{editingAppointmentId ? 'تعديل ميعاد' : 'إضافة ميعاد أو معاينة'}</h2>
              </div>
              <div className="form-grid">
                <label className="wide-field">
                  ربط بعميل مسجل
                  <select value={appointmentForm.linkedClientId ? `${appointmentForm.clientKind}:${appointmentForm.linkedClientId}` : ''} onChange={(event) => selectLinkedClient(event.target.value)}>
                    <option value="">ميعاد عام</option>
                    {linkedClientOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  عنوان الموعد
                  <input required value={appointmentForm.title} onChange={(event) => updateAppointmentForm('title', event.target.value)} />
                </label>
                <label>
                  نوع الموعد
                  <select value={appointmentForm.appointmentType} onChange={(event) => updateAppointmentForm('appointmentType', event.target.value)}>
                    {APPOINTMENT_TYPES.map((type) => <option key={type}>{type}</option>)}
                  </select>
                </label>
                <label>
                  اسم العميل
                  <input required value={appointmentForm.clientName} onChange={(event) => updateAppointmentForm('clientName', event.target.value)} />
                </label>
                <label>
                  رقم الهاتف
                  <input required inputMode="tel" value={appointmentForm.phone} onChange={(event) => updateAppointmentForm('phone', event.target.value)} />
                </label>
                <label>
                  التاريخ
                  <input required type="date" value={appointmentForm.date} onChange={(event) => updateAppointmentForm('date', event.target.value)} />
                </label>
                <label>
                  الوقت
                  <input required type="time" value={appointmentForm.time} onChange={(event) => updateAppointmentForm('time', event.target.value)} />
                </label>
                <label>
                  المدة بالدقائق
                  <input required min="15" step="15" type="number" value={appointmentForm.durationMinutes} onChange={(event) => updateAppointmentForm('durationMinutes', event.target.value)} />
                </label>
                <label>
                  الحالة
                  <select value={appointmentForm.status} onChange={(event) => updateAppointmentForm('status', event.target.value as AppointmentStatus)}>
                    {APPOINTMENT_STATUSES.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </label>
                <label className="wide-field">
                  المكان
                  <input value={appointmentForm.location} onChange={(event) => updateAppointmentForm('location', event.target.value)} />
                </label>
                <label className="wide-field">
                  ملاحظات الموعد
                  <textarea value={appointmentForm.notes} onChange={(event) => updateAppointmentForm('notes', event.target.value)} />
                </label>
              </div>
              {currentAppointmentConflicts.length > 0 && (
                <div className="conflict-box" role="alert">
                  <strong>تعارض في التوقيت</strong>
                  <span>{currentAppointmentConflicts.map((appointment) => appointment.title || appointment.clientName).join('، ')}</span>
                </div>
              )}
              <div className="form-actions">
                <button type="submit" className="primary-action" disabled={isSaving}>{editingAppointmentId ? 'حفظ التعديل' : 'إضافة الموعد'}</button>
                {editingAppointmentId && <button type="button" className="secondary-action" onClick={resetAppointmentForm}>إلغاء</button>}
              </div>
            </form>

            <div className="records-area">
              <div className="section-heading compact-heading">
                <p className="eyebrow">الجدول</p>
                <h2>كل المواعيد والمعاينات</h2>
              </div>
              <input className="search-input" placeholder="بحث باسم، رقم، تاريخ، مكان" value={appointmentSearch} onChange={(event) => setAppointmentSearch(event.target.value)} />
              <div className="record-list">
                {visibleAppointments.length === 0 && <p className="empty-state">لا توجد مواعيد مطابقة.</p>}
                {visibleAppointments.map((appointment) => {
                  const conflicts = findAppointmentConflicts(appointment, appointments)

                  return (
                    <article className={`record-row appointment-row ${conflicts.length > 0 ? 'has-conflict' : ''}`} key={appointment.id}>
                      <div className="record-main">
                        <span className="status-pill amber-pill">{appointment.status} - {clientKindLabel(appointment.clientKind)}</span>
                        <h3>{appointment.title}</h3>
                        <p>{appointment.appointmentType} مع {appointment.clientName} - {formatDate(appointment.date)} الساعة {appointment.time}</p>
                        <div className="meta-line">
                          <span>{appointment.phone}</span>
                          <span>{readDurationMinutes(appointment.durationMinutes)} دقيقة</span>
                          <span>{appointment.location || 'مكان غير محدد'}</span>
                        </div>
                        {conflicts.length > 0 && <strong className="inline-warning">يوجد تعارض مع {conflicts.length} موعد</strong>}
                      </div>
                      <div className="row-actions">
                        {phoneHref(appointment.phone) && <a className="text-action" href={phoneHref(appointment.phone)}>اتصال</a>}
                        {whatsappHref(appointment.phone) && <a className="text-action" href={whatsappHref(appointment.phone)} target="_blank" rel="noreferrer">واتساب</a>}
                        {isLiveAppointment(appointment.status) && <button type="button" className="primary-action" onClick={() => completeAppointment(appointment)}>تمت المتابعة</button>}
                        <button type="button" className="text-action" onClick={() => editAppointment(appointment)}>تعديل</button>
                        <button type="button" className="danger-action" onClick={() => deleteAppointment(appointment.id)}>حذف</button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App


