import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createSurakshaApp } from './src/serverApp';

export { createSurakshaApp };

async function startServer() {
  const { app } = createSurakshaApp();
  const port = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`SURAKSHA server listening on http://localhost:${port}`);
  });
}

// Only start HTTP listener when executed as entrypoint
const isEntry =
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));

if (isEntry) {
  void startServer();
}
