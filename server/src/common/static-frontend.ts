import express, { type Express } from 'express';
import path from 'node:path';

export function registerStaticFrontend(app: Express, directory: string) {
  app.use(express.static(directory, {
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    },
  }));
  // A missing hash belongs to an older build; HTML is never a valid JS response.
  app.use('/assets', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(404).type('text').send('Файл приложения не найден');
  });
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(directory, 'index.html'));
  });
}
