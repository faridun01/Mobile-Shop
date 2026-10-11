import type { Express } from 'express';
import { authenticateJwt } from '../../auth/auth.middleware';
import { findPhoneByImei, getKnownCatalogSpecs } from './phone-catalog.service';

export function registerPhoneCatalogRoutes(app: Express) {
  // Specs and models known from warehouse and catalog, for purchase intake autocomplete
  app.get('/api/phone-catalog/specs', authenticateJwt, async (_req, res, next) => {
    try {
      const specs = await getKnownCatalogSpecs();
      res.json(specs);
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

