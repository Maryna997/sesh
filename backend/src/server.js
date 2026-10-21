// Load variables from backend/.env before anything else reads them
import 'dotenv/config';
import app from './app.js';
import { connectDatabase } from './db/index.js';

const PORT = process.env.PORT || 5000;

try {
  await connectDatabase();
  console.log('Database connection established');
} catch (error) {
  // Only print the error message, never the connection string
  console.error('Unable to connect to the database:', error.message);
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`Sesh API listening on http://localhost:${PORT}`);
});
