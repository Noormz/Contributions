// Loads an optional .env file (see .env.example) before anything reads process.env.
// Imported first by server/index.js. Variables already set in the environment win.
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.cwd(), '.env');
if (fs.existsSync(file)) process.loadEnvFile(file);
