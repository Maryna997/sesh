// Database settings shared by the Express app and sequelize-cli.
// This file is CommonJS (.cjs) because sequelize-cli loads its config with require().
const fs = require('fs');
const path = require('path');
require('dotenv').config({ quiet: true });

// Supabase signs its database certificates with its own root CA, which Node.js
// does not trust by default. We trust that CA explicitly so the connection is
// encrypted AND the server identity is verified (no rejectUnauthorized: false).
const caCertPath = path.resolve(__dirname, '..', '..', 'certs', 'supabase-ca.crt');

if (!fs.existsSync(caCertPath)) {
  throw new Error(
    `Supabase CA certificate not found at ${caCertPath}. ` +
      'Download it from Supabase (Project Settings > Database > SSL Configuration).',
  );
}

const config = {
  use_env_variable: 'DATABASE_URL',
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      rejectUnauthorized: true,
      ca: fs.readFileSync(caCertPath, 'utf8'),
    },
  },
  // Keep the pool small: the Supabase session pooler limits connections
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  logging: false,
};

module.exports = {
  development: config,
  // Tests use TEST_DATABASE_URL when it is set (a separate database, so tests
  // never touch real data); otherwise they fall back to DATABASE_URL.
  test: {
    ...config,
    use_env_variable: process.env.TEST_DATABASE_URL ? 'TEST_DATABASE_URL' : 'DATABASE_URL',
  },
  production: config,
};
