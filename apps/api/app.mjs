import express from 'express';
import { waitUntil } from '@vercel/functions';
import { createVercelRuntime } from './dist/main/create-vercel-runtime.js';
import { createServerlessHandler } from './dist/main/serverless-handler.js';

// Build TypeScript first; Vercel packages the same JavaScript used by Node.
const app = express();
app.disable('x-powered-by');
app.use(createServerlessHandler(() => createVercelRuntime(), waitUntil));
export default app;
