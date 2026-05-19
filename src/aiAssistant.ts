import type { Appointment, AppointmentForm, DemandClient, OwnerForm, PropertyOwner, SeekerForm } from './App'

export type AiProvider = 'gemini' | 'openrouter' | 'custom'
export type AiFormTarget = 'owner' | 'seeker' | 'appointment'
export type AiSearchKind = 'owner' | 'seeker' | 'appointment'

export interface AiSettings {
  provider: AiProvider
  apiKey: string
  model: string
  customBaseUrl: string
}

export interface AiModelOption {
  id: string
  label: string
}

export interface AiStructuredResult {
  data: Record<string, string>
  summary: string
}

export interface AiCrmContext {
  owners: PropertyOwner[]
  seekers: DemandClient[]
  appointments: Appointment[]
}

export interface AiSearchResult {
  kind: AiSearchKind
  id: string
  title: string
  subtitle: string
  details: string
  score: number
}

export const defaultAiSettings: AiSettings = {
  provider: 'gemini',
  apiKey: '',
  model: 'gemini-1.5-flash',
  customBaseUrl: 'https://api.openai.com/v1',
}

const TARGET_FIELDS: Record<AiFormTarget, string[]> = {
  owner: [
    'propertyCode',
    'ownerName',
    'phone',
    'whatsapp',
    'propertyType',
    'listingIntent',
    'buildingName',
    'unitNumber',
    'city',
    'district',
    'address',
    'price',
    'area',
    'bedrooms',
    'bathrooms',
    'receptionRooms',
    'floor',
    'finishing',
    'furnishing',
    'viewDescription',
    'licenseStatus',
    'deliveryDate',
    'paymentPlan',
    'amenities',
    'mapUrl',
    'virtualTourUrl',
    'availability',
    'status',
    'source',
    'notes',
  ],
  seeker: [
    'name',
    'phone',
    'requestIntent',
    'propertyType',
    'city',
    'preferredAreas',
    'budget',
    'paymentMethod',
    'urgency',
    'status',
    'details',
    'notes',
  ],
  appointment: [
    'title',
    'appointmentType',
    'clientKind',
    'linkedClientId',
    'clientName',
    'phone',
    'date',
    'time',
    'durationMinutes',
    'location',
    'status',
    'notes',
  ],
}

const TARGET_LABELS: Record<AiFormTarget, string> = {
  owner: 'مالك وعقار جديد',
  seeker: 'عميل طالب شراء أو إيجار',
  appointment: 'موعد أو معاينة',
}

function endpointBase(settings: AiSettings) {
  if (settings.provider === 'openrouter') return 'https://openrouter.ai/api/v1'
  return settings.customBaseUrl.trim().replace(/\/+$/, '') || defaultAiSettings.customBaseUrl
}

function geminiModelPath(model: string) {
  const selectedModel = model.trim() || defaultAiSettings.model
  return selectedModel.startsWith('models/') ? selectedModel : `models/${selectedModel}`
}

function readTextFromGemini(data: unknown) {
  if (!data || typeof data !== 'object' || !('candidates' in data) || !Array.isArray(data.candidates)) return ''
  return data.candidates
    .flatMap((candidate) => candidate?.content?.parts ?? [])
    .map((part) => part?.text ?? '')
    .join('\n')
    .trim()
}

function readTextFromChatCompletion(data: unknown) {
  if (!data || typeof data !== 'object' || !('choices' in data) || !Array.isArray(data.choices)) return ''
  return String(data.choices[0]?.message?.content ?? '').trim()
}

async function readResponseJson(response: Response) {
  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok) {
    const message = data?.error?.message || data?.message || 'تعذر الاتصال بمزود الذكاء الصناعي.'
    throw new Error(message)
  }
  return data
}

async function imageToBase64(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('تعذر قراءة الصورة.'))
    reader.readAsDataURL(file)
  })
  return dataUrl.split(',')[1] ?? ''
}

function imageFiles(files: File[]) {
  return files.filter((file) => file.type.startsWith('image/')).slice(0, 6)
}

export async function fetchAiModels(settings: AiSettings): Promise<AiModelOption[]> {
  if (!settings.apiKey.trim()) throw new Error('أدخل مفتاح API أولًا لجلب النماذج.')

  if (settings.provider === 'gemini') {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(settings.apiKey.trim())}`)
    const data = await readResponseJson(response)
    return (data.models ?? [])
      .filter((model: { supportedGenerationMethods?: string[] }) => model.supportedGenerationMethods?.includes('generateContent'))
      .map((model: { name: string; displayName?: string }) => ({
        id: model.name,
        label: model.displayName ? `${model.displayName} - ${model.name}` : model.name,
      }))
  }

  const response = await fetch(`${endpointBase(settings)}/models`, {
    headers: { Authorization: `Bearer ${settings.apiKey.trim()}` },
  })
  const data = await readResponseJson(response)
  return (data.data ?? []).map((model: { id: string; name?: string }) => ({
    id: model.id,
    label: model.name ? `${model.name} - ${model.id}` : model.id,
  }))
}

async function callGemini(settings: AiSettings, prompt: string, files: File[]) {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: prompt }]

  for (const file of imageFiles(files)) {
    parts.push({ inlineData: { mimeType: file.type, data: await imageToBase64(file) } })
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${geminiModelPath(settings.model)}:generateContent?key=${encodeURIComponent(settings.apiKey.trim())}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }] }),
  })
  const data = await readResponseJson(response)
  return readTextFromGemini(data)
}

async function callChatCompletion(settings: AiSettings, prompt: string, files: File[]) {
  const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [{ type: 'text', text: prompt }]

  for (const file of imageFiles(files)) {
    content.push({ type: 'image_url', image_url: { url: `data:${file.type};base64,${await imageToBase64(file)}` } })
  }

  const response = await fetch(`${endpointBase(settings)}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.apiKey.trim()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': globalThis.location?.origin ?? 'https://gad123145.github.io',
      'X-Title': 'Real Estate CRM Arabic',
    },
    body: JSON.stringify({
      model: settings.model.trim(),
      messages: [{ role: 'user', content }],
      temperature: 0.15,
    }),
  })
  const data = await readResponseJson(response)
  return readTextFromChatCompletion(data)
}

async function callAi(settings: AiSettings, prompt: string, files: File[] = []) {
  if (!settings.apiKey.trim()) throw new Error('أدخل مفتاح API من إعدادات الذكاء الصناعي أولًا.')
  if (!settings.model.trim()) throw new Error('اختر نموذج الذكاء الصناعي أولًا.')

  const text = settings.provider === 'gemini'
    ? await callGemini(settings, prompt, files)
    : await callChatCompletion(settings, prompt, files)

  if (!text) throw new Error('لم يرجع النموذج ردًا يمكن استخدامه.')
  return text
}

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const candidate = fenced ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  return JSON.parse(candidate)
}

function stringRecord(value: unknown) {
  const result: Record<string, string> = {}
  if (!value || typeof value !== 'object') return result

  Object.entries(value).forEach(([key, entry]) => {
    if (entry === null || entry === undefined) {
      result[key] = ''
    } else if (Array.isArray(entry)) {
      result[key] = entry.join('، ')
    } else if (typeof entry === 'object') {
      result[key] = JSON.stringify(entry)
    } else {
      result[key] = String(entry)
    }
  })

  return result
}

function structuredPrompt(target: AiFormTarget, text: string, currentDate: string) {
  return `أنت مساعد إدخال بيانات لنظام CRM عقاري عربي. استخرج بيانات ${TARGET_LABELS[target]} من النص والصور المرفقة إن وجدت.

التاريخ الحالي: ${currentDate}

القواعد:
- لا تخترع بيانات غير موجودة. الحقل غير المعروف اجعله نصًا فارغًا.
- أرجع JSON فقط بدون شرح خارجي.
- استخدم مفاتيح الحقول التالية فقط: ${TARGET_FIELDS[target].join(', ')}.
- كل القيم نصوص.
- التواريخ بصيغة YYYY-MM-DD والوقت بصيغة HH:mm إن أمكن.
- للمالك: propertyType من نوع العقار، listingIntent بيع/إيجار/بيع أو إيجار، status افتراضيًا جديد.
- للطالب: requestIntent شراء/إيجار/شراء أو إيجار، status افتراضيًا جديد، واجمع شروط العميل في details.
- للموعد: clientKind يكون owner أو seeker أو general، status افتراضيًا مؤكد، durationMinutes رقم كنص.

النص الخام:
${text}`
}

export async function extractCrmForm(settings: AiSettings, target: AiFormTarget, text: string, files: File[], currentDate: string): Promise<AiStructuredResult> {
  if (!text.trim() && files.length === 0) throw new Error('أضف نصًا أو صورًا ليتم تحليلها.')
  const response = await callAi(settings, structuredPrompt(target, text, currentDate), files)
  const parsed = extractJson(response)
  const data = stringRecord(parsed)
  const summary = Object.entries(data)
    .filter(([, value]) => value.trim())
    .slice(0, 6)
    .map(([key, value]) => `${key}: ${value}`)
    .join(' | ')
  return { data, summary: summary || 'تم استخراج البيانات المتاحة.' }
}

function normalizeArabic(value: string) {
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

function tokens(value: string) {
  return normalizeArabic(value)
    .split(/[^\p{L}\p{N}+]+/u)
    .filter((token) => token.length > 1)
}

function scoreText(queryTokens: string[], text: string) {
  const normalizedText = normalizeArabic(text)
  return queryTokens.reduce((score, token) => score + (normalizedText.includes(token) ? 1 : 0), 0)
}

function ownerText(owner: PropertyOwner) {
  return [
    owner.ownerName,
    owner.propertyCode,
    owner.phone,
    owner.whatsapp,
    owner.propertyType,
    owner.listingIntent,
    owner.city,
    owner.district,
    owner.address,
    owner.buildingName,
    owner.unitNumber,
    owner.price,
    owner.area,
    owner.bedrooms,
    owner.bathrooms,
    owner.receptionRooms,
    owner.floor,
    owner.finishing,
    owner.furnishing,
    owner.viewDescription,
    owner.licenseStatus,
    owner.deliveryDate,
    owner.paymentPlan,
    owner.amenities,
    owner.availability,
    owner.status,
    owner.source,
    owner.notes,
    ...owner.media.map((media) => media.fileName),
  ].join(' ')
}

function seekerText(seeker: DemandClient) {
  return [
    seeker.name,
    seeker.phone,
    seeker.requestIntent,
    seeker.propertyType,
    seeker.city,
    seeker.preferredAreas,
    seeker.budget,
    seeker.paymentMethod,
    seeker.urgency,
    seeker.status,
    seeker.details,
    seeker.notes,
  ].join(' ')
}

function appointmentText(appointment: Appointment) {
  return [
    appointment.title,
    appointment.appointmentType,
    appointment.clientKind,
    appointment.clientName,
    appointment.phone,
    appointment.date,
    appointment.time,
    appointment.location,
    appointment.status,
    appointment.notes,
  ].join(' ')
}

export function rankCrmRecords(query: string, context: AiCrmContext): AiSearchResult[] {
  const queryTokens = tokens(query)
  const normalizedQuery = normalizeArabic(query)
  const wantsOwners = /عقار|عقارات|مالك|ملاك|شقه|فيلا|بيع|ايجار|منطقه|سعر|غرف/.test(normalizedQuery)
  const wantsSeekers = /طالب|عميل|طلب|ميزانيه|شراء|ايجار|عايز|يريد/.test(normalizedQuery)
  const wantsAppointments = /موعد|معاد|معاينه|مكالمة|متابعه|اليوم|غدا|تاريخ/.test(normalizedQuery)

  const ownerResults = context.owners.map((owner) => ({
    kind: 'owner' as const,
    id: owner.id,
    title: `${owner.propertyType} ${owner.listingIntent} - ${owner.ownerName || 'مالك بدون اسم'}`,
    subtitle: [owner.city, owner.district, owner.price].filter(Boolean).join(' - ') || 'بدون عنوان رئيسي',
    details: [
      owner.propertyCode && `كود ${owner.propertyCode}`,
      owner.area,
      owner.floor && `الدور ${owner.floor}`,
      owner.bedrooms && `${owner.bedrooms} غرف`,
      owner.bathrooms && `${owner.bathrooms} حمام`,
      owner.finishing,
      owner.amenities,
      `${owner.media.length} وسائط`,
    ].filter(Boolean).join(' | '),
    score: scoreText(queryTokens, ownerText(owner)) + (wantsOwners ? 0.8 : 0),
  }))

  const seekerResults = context.seekers.map((seeker) => ({
    kind: 'seeker' as const,
    id: seeker.id,
    title: `${seeker.name || 'عميل بدون اسم'} - ${seeker.requestIntent} ${seeker.propertyType}`,
    subtitle: [seeker.preferredAreas || seeker.city, seeker.budget].filter(Boolean).join(' - ') || 'طلب بدون منطقة محددة',
    details: seeker.details || seeker.notes || 'لا توجد تفاصيل إضافية',
    score: scoreText(queryTokens, seekerText(seeker)) + (wantsSeekers ? 0.8 : 0),
  }))

  const appointmentResults = context.appointments.map((appointment) => ({
    kind: 'appointment' as const,
    id: appointment.id,
    title: appointment.title || appointment.appointmentType,
    subtitle: `${appointment.clientName || 'بدون عميل'} - ${appointment.date} ${appointment.time}`,
    details: [appointment.location, appointment.status, appointment.phone].filter(Boolean).join(' | '),
    score: scoreText(queryTokens, appointmentText(appointment)) + (wantsAppointments ? 0.8 : 0),
  }))

  return [...ownerResults, ...seekerResults, ...appointmentResults]
    .filter((result) => result.score > 0)
    .sort((first, second) => second.score - first.score)
    .slice(0, 12)
}

function summarizeContext(context: AiCrmContext) {
  const owners = context.owners.slice(0, 40).map((owner) => (
    `OWNER ${owner.id}: ${owner.propertyType} ${owner.listingIntent}, المالك ${owner.ownerName}, كود ${owner.propertyCode}, ${owner.city} ${owner.district}, العنوان ${owner.address}, المبنى ${owner.buildingName}, الوحدة ${owner.unitNumber}, الدور ${owner.floor}, سعر ${owner.price}, مساحة ${owner.area}, غرف ${owner.bedrooms}, حمامات ${owner.bathrooms}, ريسبشن ${owner.receptionRooms}, تشطيب ${owner.finishing}, فرش ${owner.furnishing}, فيو ${owner.viewDescription}, ترخيص ${owner.licenseStatus}, تسليم ${owner.deliveryDate}, دفع ${owner.paymentPlan}, مميزات ${owner.amenities}, حالة ${owner.status}, وسائط ${owner.media.length}, ملاحظات ${owner.notes}`
  ))
  const seekers = context.seekers.slice(0, 40).map((seeker) => (
    `SEEKER ${seeker.id}: ${seeker.name}, ${seeker.requestIntent} ${seeker.propertyType}, مناطق ${seeker.preferredAreas || seeker.city}, ميزانية ${seeker.budget}, تفاصيل ${seeker.details}`
  ))
  const appointments = context.appointments.slice(0, 50).map((appointment) => (
    `APPOINTMENT ${appointment.id}: ${appointment.title}, ${appointment.clientName}, ${appointment.date} ${appointment.time}, ${appointment.location}, ${appointment.status}`
  ))
  return [...owners, ...seekers, ...appointments].join('\n') || 'لا توجد بيانات مسجلة بعد.'
}

export async function askCrmAssistant(settings: AiSettings, question: string, context: AiCrmContext, localResults: AiSearchResult[]) {
  if (!question.trim()) throw new Error('اكتب سؤالك أولًا.')

  const prompt = `أنت مساعد ذكي داخل CRM عقاري عربي. أجب على سؤال المستخدم اعتمادًا فقط على البيانات التالية، واذكر السجلات المناسبة بالعناوين الرئيسية بدون اختراع بيانات. إذا وجدت نتائج مشابهة وليست مطابقة فقل إنها مشابهة.

نسق الإجابة بالعربية بهذا الشكل:
ملخص: سطر قصير مباشر.
النتائج:
- النوع: عقار/طلب/موعد | الاسم أو العنوان | السبب المختصر | السعر/التاريخ إن وجد | اذكر ID كما هو.
اقتراح: خطوة عملية واحدة.

سؤال المستخدم:
${question}

أقرب نتائج البحث المحلي:
${localResults.map((result) => `${result.kind} ${result.id}: ${result.title} - ${result.subtitle} - ${result.details}`).join('\n') || 'لا توجد نتائج محلية مباشرة.'}

بيانات النظام:
${summarizeContext(context)}`

  return callAi(settings, prompt)
}

export type OwnerAiData = Partial<Record<keyof OwnerForm, string>>
export type SeekerAiData = Partial<Record<keyof SeekerForm, string>>
export type AppointmentAiData = Partial<Record<keyof AppointmentForm, string>>