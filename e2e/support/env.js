// E2E environment: ports, URLs and the disposable database. Loaded by the
// Playwright config, so every check here runs before any server starts.
//
// Safety: the E2E database must be given explicitly (E2E_DATABASE_URL) and
// must be a local database whose name contains "e2e". Anything else (a
// Supabase or other remote URL, or a local development database) stops the
// run before the backend starts or any migration / cleanup runs.
import { randomBytes } from 'node:crypto'

export const BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT || 5056)
export const FRONTEND_PORT = Number(process.env.E2E_FRONTEND_PORT || 5176)
export const BACKEND_URL = `http://localhost:${BACKEND_PORT}`
export const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function e2eDatabaseUrl() {
  const raw = process.env.E2E_DATABASE_URL
  if (!raw) {
    throw new Error(
      'E2E_DATABASE_URL is not set. Point it at a disposable local PostgreSQL database whose name contains "e2e", ' +
        'e.g. postgres://postgres:postgres@localhost:5432/sesh_e2e (see docs or the CI workflow).',
    )
  }
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error('E2E_DATABASE_URL is not a valid URL.')
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''))
  if (!/^postgres(ql)?:$/.test(url.protocol)) throw new Error('E2E_DATABASE_URL must be a postgres:// URL.')
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`Refusing to run E2E tests against a non-local database host (${url.hostname}). Use a disposable local database.`)
  }
  if (!/e2e/i.test(database)) {
    throw new Error(`Refusing to run E2E tests against database "${database}": its name must contain "e2e" (it is wiped on every run).`)
  }
  return raw
}

// A fresh signing secret for every run (never a real one)
const JWT_SECRET = `e2e-${randomBytes(32).toString('hex')}`

// Environment of the backend started for the tests. DATABASE_URL and
// TEST_DATABASE_URL both point at the E2E database, and the Cloudinary
// variables are set to empty values, so backend/.env (loaded by dotenv,
// which never overrides variables that are already set) can't add a real
// database or real Cloudinary credentials.
export function backendEnv() {
  const databaseUrl = e2eDatabaseUrl()
  return {
    NODE_ENV: 'test',
    PORT: String(BACKEND_PORT),
    CLIENT_URL: FRONTEND_URL,
    DATABASE_URL: databaseUrl,
    TEST_DATABASE_URL: databaseUrl,
    TEST_DATABASE_SSL: 'false',
    JWT_SECRET,
    BCRYPT_ROUNDS: '4',
    CLOUDINARY_CLOUD_NAME: '',
    CLOUDINARY_API_KEY: '',
    CLOUDINARY_API_SECRET: '',
  }
}
