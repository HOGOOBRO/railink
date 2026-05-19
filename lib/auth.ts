export interface User {
  uid: string
  email: string
  name: string
  employeeId: string
  part?: string
  photo?: string
  pw: string
}

export interface Session {
  uid: string
  email: string
  name: string
  employeeId: string
  part?: string
  photo?: string
}

const USERS_KEY = 'railink_users_v3'
const SESSION_KEY = 'railink_session_v3'

export function getUsers(): User[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(USERS_KEY) ?? '[]') } catch { return [] }
}

export function saveUsers(users: User[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch { return null }
}

export function setSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}

function toSession(u: User): Session {
  return {
    uid: u.uid, email: u.email, name: u.name,
    employeeId: u.employeeId, part: u.part, photo: u.photo,
  }
}

export type LoginResult =
  | { ok: true; session: Session }
  | { ok: false; field: 'email' | 'password'; message: string }

export function login(email: string, password: string): LoginResult {
  const users = getUsers()
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase())
  // Security: don't disclose which field is wrong.
  if (!user || user.pw !== password) {
    return { ok: false, field: 'email', message: '이메일 또는 비밀번호를 확인해 주세요.' }
  }
  const session = toSession(user)
  setSession(session)
  return { ok: true, session }
}

export type SignupResult =
  | { ok: true; session: Session }
  | { ok: false; field: string; message: string }

export function signup(data: Omit<User, 'uid'>): SignupResult {
  const users = getUsers()
  if (users.some(u => u.email.toLowerCase() === data.email.toLowerCase())) {
    return { ok: false, field: 'email', message: '이미 가입된 이메일이에요.' }
  }
  if (users.some(u => u.employeeId === data.employeeId)) {
    return { ok: false, field: 'employeeId', message: '이 사번으로 가입된 계정이 있어요.' }
  }
  const uid = crypto.randomUUID()
  const user: User = { uid, ...data }
  saveUsers([...users, user])
  const session = toSession(user)
  setSession(session)
  return { ok: true, session }
}

export function logout(): void {
  clearSession()
}
