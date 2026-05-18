import { supabase } from './supabaseClient'
import type { Appointment, AppointmentForm, DemandClient, OwnerForm, PropertyOwner, SeekerForm } from './App'

type OwnerRow = {
  id: string
  created_at: string
  owner_name: string
  phone: string
  whatsapp: string | null
  property_type: string
  listing_intent: string
  city: string | null
  district: string | null
  address: string | null
  price: string | null
  area: string | null
  bedrooms: string | null
  floor: string | null
  finishing: string | null
  availability: string | null
  status: PropertyOwner['status']
  source: string | null
  notes: string | null
}

type SeekerRow = {
  id: string
  created_at: string
  name: string
  phone: string
  request_intent: string
  property_type: string
  city: string | null
  preferred_areas: string | null
  budget: string | null
  payment_method: string | null
  urgency: string | null
  status: DemandClient['status']
  details: string
  notes: string | null
}

type AppointmentRow = {
  id: string
  created_at: string
  title: string
  appointment_type: string
  client_kind: Appointment['clientKind']
  linked_client_id: string | null
  client_name: string
  phone: string
  appointment_date: string
  appointment_time: string
  duration_minutes: number
  location: string | null
  status: Appointment['status']
  notes: string | null
}

function getClient() {
  if (!supabase) {
    throw new Error('لم يتم ضبط اتصال Supabase بعد.')
  }

  return supabase
}

function readErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return 'حدث خطأ غير متوقع أثناء الاتصال بقاعدة البيانات.'
}

function nullable(value: string) {
  return value.trim() || null
}

function normalizeTime(value: string) {
  return value.length === 5 ? `${value}:00` : value
}

function ownerFromRow(row: OwnerRow): PropertyOwner {
  return {
    id: row.id,
    createdAt: row.created_at,
    ownerName: row.owner_name,
    phone: row.phone,
    whatsapp: row.whatsapp ?? '',
    propertyType: row.property_type,
    listingIntent: row.listing_intent,
    city: row.city ?? '',
    district: row.district ?? '',
    address: row.address ?? '',
    price: row.price ?? '',
    area: row.area ?? '',
    bedrooms: row.bedrooms ?? '',
    floor: row.floor ?? '',
    finishing: row.finishing ?? '',
    availability: row.availability ?? '',
    status: row.status,
    source: row.source ?? '',
    notes: row.notes ?? '',
  }
}

function ownerToRow(form: OwnerForm) {
  return {
    owner_name: form.ownerName,
    phone: form.phone,
    whatsapp: nullable(form.whatsapp),
    property_type: form.propertyType,
    listing_intent: form.listingIntent,
    city: nullable(form.city),
    district: nullable(form.district),
    address: nullable(form.address),
    price: nullable(form.price),
    area: nullable(form.area),
    bedrooms: nullable(form.bedrooms),
    floor: nullable(form.floor),
    finishing: nullable(form.finishing),
    availability: nullable(form.availability),
    status: form.status,
    source: nullable(form.source),
    notes: nullable(form.notes),
  }
}

function seekerFromRow(row: SeekerRow): DemandClient {
  return {
    id: row.id,
    createdAt: row.created_at,
    name: row.name,
    phone: row.phone,
    requestIntent: row.request_intent,
    propertyType: row.property_type,
    city: row.city ?? '',
    preferredAreas: row.preferred_areas ?? '',
    budget: row.budget ?? '',
    paymentMethod: row.payment_method ?? '',
    urgency: row.urgency ?? '',
    status: row.status,
    details: row.details,
    notes: row.notes ?? '',
  }
}

function seekerToRow(form: SeekerForm) {
  return {
    name: form.name,
    phone: form.phone,
    request_intent: form.requestIntent,
    property_type: form.propertyType,
    city: nullable(form.city),
    preferred_areas: nullable(form.preferredAreas),
    budget: nullable(form.budget),
    payment_method: nullable(form.paymentMethod),
    urgency: nullable(form.urgency),
    status: form.status,
    details: form.details,
    notes: nullable(form.notes),
  }
}

function appointmentFromRow(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    createdAt: row.created_at,
    title: row.title,
    appointmentType: row.appointment_type,
    clientKind: row.client_kind,
    linkedClientId: row.linked_client_id ?? '',
    clientName: row.client_name,
    phone: row.phone,
    date: row.appointment_date,
    time: row.appointment_time.slice(0, 5),
    durationMinutes: row.duration_minutes,
    location: row.location ?? '',
    status: row.status,
    notes: row.notes ?? '',
  }
}

function appointmentToRow(form: AppointmentForm) {
  return {
    title: form.title,
    appointment_type: form.appointmentType,
    client_kind: form.clientKind,
    linked_client_id: nullable(form.linkedClientId),
    client_name: form.clientName,
    phone: form.phone,
    appointment_date: form.date,
    appointment_time: normalizeTime(form.time),
    duration_minutes: Math.max(15, Number(form.durationMinutes) || 60),
    location: nullable(form.location),
    status: form.status,
    notes: nullable(form.notes),
  }
}

export function getCrmErrorMessage(error: unknown) {
  return readErrorMessage(error)
}

export async function fetchCrmData() {
  const client = getClient()

  const [ownersResult, seekersResult, appointmentsResult] = await Promise.all([
    client.from('crm_property_owners').select('*').order('created_at', { ascending: false }),
    client.from('crm_demand_clients').select('*').order('created_at', { ascending: false }),
    client.from('crm_appointments').select('*').order('appointment_date', { ascending: true }).order('appointment_time', { ascending: true }),
  ])

  if (ownersResult.error) throw ownersResult.error
  if (seekersResult.error) throw seekersResult.error
  if (appointmentsResult.error) throw appointmentsResult.error

  return {
    owners: (ownersResult.data as OwnerRow[]).map(ownerFromRow),
    seekers: (seekersResult.data as SeekerRow[]).map(seekerFromRow),
    appointments: (appointmentsResult.data as AppointmentRow[]).map(appointmentFromRow),
  }
}

export async function createPropertyOwner(form: OwnerForm) {
  const { data, error } = await getClient()
    .from('crm_property_owners')
    .insert(ownerToRow(form))
    .select('*')
    .single()

  if (error) throw error
  return ownerFromRow(data as OwnerRow)
}

export async function updatePropertyOwner(id: string, form: OwnerForm) {
  const { data, error } = await getClient()
    .from('crm_property_owners')
    .update(ownerToRow(form))
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return ownerFromRow(data as OwnerRow)
}

export async function deletePropertyOwnerAndAppointments(id: string) {
  const client = getClient()
  const appointmentsResult = await client
    .from('crm_appointments')
    .delete()
    .eq('client_kind', 'owner')
    .eq('linked_client_id', id)

  if (appointmentsResult.error) throw appointmentsResult.error

  const ownerResult = await client.from('crm_property_owners').delete().eq('id', id)
  if (ownerResult.error) throw ownerResult.error
}

export async function createDemandClient(form: SeekerForm) {
  const { data, error } = await getClient()
    .from('crm_demand_clients')
    .insert(seekerToRow(form))
    .select('*')
    .single()

  if (error) throw error
  return seekerFromRow(data as SeekerRow)
}

export async function updateDemandClient(id: string, form: SeekerForm) {
  const { data, error } = await getClient()
    .from('crm_demand_clients')
    .update(seekerToRow(form))
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return seekerFromRow(data as SeekerRow)
}

export async function deleteDemandClientAndAppointments(id: string) {
  const client = getClient()
  const appointmentsResult = await client
    .from('crm_appointments')
    .delete()
    .eq('client_kind', 'seeker')
    .eq('linked_client_id', id)

  if (appointmentsResult.error) throw appointmentsResult.error

  const seekerResult = await client.from('crm_demand_clients').delete().eq('id', id)
  if (seekerResult.error) throw seekerResult.error
}

export async function createAppointmentRecord(form: AppointmentForm) {
  const { data, error } = await getClient()
    .from('crm_appointments')
    .insert(appointmentToRow(form))
    .select('*')
    .single()

  if (error) throw error
  return appointmentFromRow(data as AppointmentRow)
}

export async function updateAppointmentRecord(id: string, form: AppointmentForm) {
  const { data, error } = await getClient()
    .from('crm_appointments')
    .update(appointmentToRow(form))
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return appointmentFromRow(data as AppointmentRow)
}

export async function deleteAppointmentRecord(id: string) {
  const { error } = await getClient().from('crm_appointments').delete().eq('id', id)
  if (error) throw error
}