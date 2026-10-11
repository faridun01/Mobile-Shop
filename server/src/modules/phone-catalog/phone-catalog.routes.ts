import type { Express } from 'express';
import { authenticateJwt } from '../../auth/auth.middleware';
import { findPhoneByImei, searchCatalogModels } from './phone-catalog.service';

export function registerPhoneCatalogRoutes(app: Express) {
  // Model names from the catalog for pickers: ?q=part of the model (at least 2 letters), &brand=.
  app.get('/api/phone-catalog/models', authenticateJwt, async (req, res, next) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 60) : '';
      const brand = typeof req.query.brand === 'string' ? req.query.brand.slice(0, 40) : undefined;
      res.json(await searchCatalogModels(q, brand));
    } catch (error) {
      next(error);
    }
  });

  // IMEI autofill: brand and model of a scanned phone by its first 8 digits (TAC). Not found is
  // a normal answer (the phone is then entered by hand and remembered on receipt), not an error.
  app.get('/api/phone-catalog/:imei', authenticateJwt, async (req, res, next) => {
    try {
      const phone = await findPhoneByImei(req.params.imei);
      res.json(phone ? { found: true, ...phone } : { found: false });
    } catch (error) {
      next(error);
    }
  });
}
