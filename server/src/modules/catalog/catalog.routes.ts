import type { Express } from 'express';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { findAccessoryByBarcode, isSuggestField, listAccessoryStock, suggestValues, type SuggestKind } from './catalog.service';

export function registerCatalogRoutes(app: Express) {
  // Typeahead for the receipt form: saved tablet/accessory values containing what is typed.
  // Receipts are ADMIN-only, and so are their suggestions.
  app.get('/api/catalog/suggest', authenticateJwt, requireRoles('ADMIN'), async (req, res, next) => {
    try {
      const kind: SuggestKind = req.query.kind === 'ACCESSORY' ? 'ACCESSORY' : 'TABLET';
      const field = typeof req.query.field === 'string' ? req.query.field : '';
      if (!isSuggestField(kind, field)) {
        res.status(400).json({ message: 'Неизвестное поле для подсказок' });
        return;
      }
      const values = await suggestValues({
        kind,
        field,
        query: typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '',
        brand: typeof req.query.brand === 'string' ? req.query.brand.slice(0, 100) : undefined,
      });
      res.json({ values });
    } catch (error) {
      next(error);
    }
  });

  // The saved card behind a scanned accessory barcode; a new barcode is a normal answer.
  app.get('/api/accessories/by-barcode/:barcode', authenticateJwt, requireRoles('ADMIN'), async (req, res, next) => {
    try {
      const product = await findAccessoryByBarcode(req.params.barcode);
      res.json(product ? { found: true, product } : { found: false });
    } catch (error) {
      next(error);
    }
  });

  // Accessory stock by location. Store staff see their own store; the stock cost is ADMIN-only.
  app.get('/api/accessories', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const isStoreScoped = req.user!.role === 'SELLER' || req.user!.role === 'PARTNER';
      if (isStoreScoped && !req.user!.storeId) {
        res.status(403).json({ message: 'Пользователь не привязан ни к одному магазину' });
        return;
      }
      const requested = typeof req.query.storeId === 'string' && req.query.storeId !== 'all' ? req.query.storeId : undefined;
      const products = await listAccessoryStock({
        storeId: isStoreScoped ? req.user!.storeId! : requested,
        // Cost of stock: the admin and partners (the warehouse shows it), never sellers.
        includeCost: req.user!.role === 'ADMIN' || req.user!.role === 'PARTNER',
        search: typeof req.query.search === 'string' ? req.query.search.slice(0, 100) : undefined,
      });
      res.json(products);
    } catch (error) {
      next(error);
    }
  });
}
