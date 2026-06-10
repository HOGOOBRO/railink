/* 약속 잡기 (Appointment) store.
 *
 * MVP: localStorage-only, mirroring the demo/local pattern of the schedule
 * store. Supabase persistence (a new `appointments` + `appointment_participants`
 * table behind SECURITY DEFINER RPCs, with solo `title` visibility gated by an
 * accepted schedule_share — see the handoff review) is staged for after the
 * feature is approved; the function surface here is shaped so a remote backing
 * can slot in without touching callers.
 */

import type { Appointment } from '@/lib/types/schedule'

const KEY = 'railink_appointments_v1'

function read(): Appointment[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

function write(list: Appointment[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(list))
}

function newId(): string {
  return 'ap_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** True when `uid` can see the appointment (owner or invited participant). */
function visibleTo(a: Appointment, uid: string): boolean {
  return a.ownerUid === uid || a.participants.includes(uid)
}

/** Appointments visible to `uid` whose date falls in the given month. */
export function getMonthAppointments(uid: string, year: number, month: number): Appointment[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return read().filter(a => a.date.startsWith(prefix) && visibleTo(a, uid))
}

export function addAppointment(appt: Omit<Appointment, 'id'>): Appointment {
  const full: Appointment = { ...appt, id: newId() }
  write([...read(), full])
  return full
}

export function deleteAppointment(id: string): void {
  write(read().filter(a => a.id !== id))
}
