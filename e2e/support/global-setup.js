// Runs once before the tests: brings the disposable E2E database to the
// current schema with the project's own Sequelize migrations, then removes
// all data left by earlier runs. Surf spots (inserted by a migration) and the
// migration history are kept.
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { backendEnv, e2eDatabaseUrl } from './env.js'

const backendDir = fileURLToPath(new URL('../../backend/', import.meta.url))
// The backend's own PostgreSQL driver (no extra dependency for the E2E package)
const { Client } = createRequire(new URL('../../backend/package.json', import.meta.url))('pg')

export default async function globalSetup() {
  const databaseUrl = e2eDatabaseUrl() // throws unless local and named *e2e*

  execSync('npm run db:migrate:test', {
    cwd: backendDir,
    env: { ...process.env, ...backendEnv() },
    stdio: 'inherit',
  })

  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    // users cascades to sessions, profiles, favorite spots, availability,
    // conversations and messages (every table that references them)
    await client.query('TRUNCATE users CASCADE')
  } finally {
    await client.end()
  }
}
