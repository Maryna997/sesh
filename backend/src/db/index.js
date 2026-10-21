import { Sequelize } from 'sequelize';
import databaseConfig from '../config/database.cjs';

const env = process.env.NODE_ENV || 'development';
const { use_env_variable: urlVariable, ...options } = databaseConfig[env];
const databaseUrl = process.env[urlVariable];

if (!databaseUrl) {
  throw new Error(`${urlVariable} is not set. Add it to backend/.env`);
}

// One shared Sequelize instance for the whole app
export const sequelize = new Sequelize(databaseUrl, options);

// Checks that the database is reachable and the credentials are valid
export async function connectDatabase() {
  await sequelize.authenticate();
}
