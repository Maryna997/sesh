// Load variables from backend/.env before anything else reads them
import 'dotenv/config';
import app from './app.js';

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Sesh API listening on http://localhost:${PORT}`);
});
