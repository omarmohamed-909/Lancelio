import express from 'express';
import { createVercelRuntime } from './main/create-vercel-runtime.js';
import { createServerlessHandler } from './main/serverless-handler.js';

// Vercel's native Express entry: no listener or background interval in a Function.
const app = express();
app.disable('x-powered-by');
app.use(createServerlessHandler(() => createVercelRuntime()));
export default app;
