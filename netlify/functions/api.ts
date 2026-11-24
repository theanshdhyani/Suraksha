import express from 'express';
import serverless from 'serverless-http';
import { createSurakshaApp } from '../../src/serverApp';

let cachedHandler: ReturnType<typeof serverless> | null = null;

function getHandler() {
  if (!cachedHandler) {
    const { app } = createSurakshaApp();
    const wrapper = express();

    // Normalize Netlify Function rewrite paths so both `/api/*` and
    // `/.netlify/functions/api/*` route cleanly into `createSurakshaApp()`.
    wrapper.use((req, _res, next) => {
      if (req.url.startsWith('/.netlify/functions/api')) {
        const stripped = req.url.slice('/.netlify/functions/api'.length);
        req.url = stripped.startsWith('/api')
          ? stripped
          : `/api${stripped.startsWith('/') ? stripped : `/${stripped}`}`;
      }
      next();
    });

    wrapper.use(app);
    cachedHandler = serverless(wrapper);
  }
  return cachedHandler;
}

export const handler = async (event: unknown, context: unknown) => {
  const fn = getHandler();
  return fn(event as Parameters<typeof fn>[0], context as Parameters<typeof fn>[1]);
};
