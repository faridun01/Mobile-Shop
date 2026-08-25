import { test, expect } from '@playwright/test';
import { loginAsUi } from './helpers';

/**
 * Regression coverage for two real adaptive-UI bugs found via manual audit at
 * mobile/tablet/desktop breakpoints (360-1440px):
 *
 * 1. MobileBottomNav (`lg:hidden`) rendered at the same time as TabletNavRail
 *    (`hidden md:flex lg:hidden`) in the 768-1023px tablet range — two
 *    navigation surfaces on screen at once. Fixed by scoping MobileBottomNav
 *    to `md:hidden` (mobile-only, <768px).
 * 2. EmployeesPage's card grid (`grid grid-cols-1 ... items-start`) computed
 *    every implicit row at a fixed 34px regardless of actual card content
 *    height (~360-380px), because a grid item with `overflow-hidden` lets the
 *    browser collapse its auto row track. Cards overlapped by ~90%, silently
 *    covering lower cards' badges/action buttons and intercepting their
 *    clicks. Fixed with `auto-rows-max` on the grid container.
 */

const BREAKPOINTS = [
  { name: 'mobile-360', width: 360, height: 740 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-430', width: 430, height: 932 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'tablet-1024', width: 1024, height: 1366 },
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'desktop-1440', width: 1440, height: 900 },
] as const;

const PAGES = [
  'sale', 'sales-history', 'exchange', 'repair', 'inventory', 'purchase',
  'transfer', 'suppliers', 'reports', 'expenses', 'bonuses', 'owners',
  'employees', 'audit-log', 'notifications', 'settings',
] as const;

test.describe('Adaptive UI — navigation surfaces', () => {
  test('exactly one primary nav surface is visible at each breakpoint tier', async ({ page }) => {
    await loginAsUi(page, 'ADMIN');

    const tiers: Array<{ width: number; expectVisible: string; expectHidden: string[] }> = [
      { width: 390, expectVisible: 'mobile-bottom-nav', expectHidden: ['tablet-nav-rail', 'desktop-sidebar'] },
      { width: 768, expectVisible: 'tablet-nav-rail', expectHidden: ['mobile-bottom-nav', 'desktop-sidebar'] },
      { width: 1280, expectVisible: 'desktop-sidebar', expectHidden: ['mobile-bottom-nav', 'tablet-nav-rail'] },
    ];

    for (const tier of tiers) {
      await page.setViewportSize({ width: tier.width, height: 900 });
      await page.waitForTimeout(150);

      const visibility = await page.evaluate(() => {
        const mobileBottomNav = document.querySelector('div.fixed.bottom-0');
        const asides = Array.from(document.querySelectorAll('aside'));
        return {
          mobileBottomNavVisible: !!mobileBottomNav && getComputedStyle(mobileBottomNav).display !== 'none',
          asideDisplays: asides.map((a) => getComputedStyle(a).display),
        };
      });

      const visibleAsideCount = visibility.asideDisplays.filter((d) => d !== 'none').length;
      const totalVisibleNavSurfaces = (visibility.mobileBottomNavVisible ? 1 : 0) + visibleAsideCount;

      expect(totalVisibleNavSurfaces, `at ${tier.width}px exactly one nav surface should render`).toBe(1);
    }
  });
});

test.describe('Adaptive UI — Employees card grid (mobile)', () => {
  test('employee cards stack without overlapping and their action buttons are really clickable', async ({ page }) => {
    await loginAsUi(page, 'ADMIN');
    await page.setViewportSize({ width: 390, height: 844 });
    // The mobile bottom nav only surfaces 5 icons directly (the rest live behind
    // the "Меню" drawer), so navigate by URL here rather than via the desktop
    // sidebar-click helper.
    await page.goto('/employees', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);

    const rects = await page.evaluate(() => {
      const grid = document.querySelector('.grid.grid-cols-1');
      if (!grid) return [];
      return Array.from(grid.children).map((c) => {
        const r = c.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      });
    });

    expect(rects.length).toBeGreaterThan(1);
    for (let i = 1; i < rects.length; i++) {
      expect(rects[i].top, `card ${i} must start at/after the previous card's bottom edge, not overlap it`).toBeGreaterThanOrEqual(rects[i - 1].bottom - 2);
    }

    // A real click (not a forced/JS click) must land on the button itself, not
    // an overlapping sibling card — this is exactly what the overlap bug broke.
    await page.getByRole('button', { name: 'ИСТОРИЯ' }).first().click({ timeout: 5000 });
    await expect(page.getByText('ФИНАНСОВАЯ ИСТОРИЯ И ОПЕРАЦИИ', { exact: false })).toBeVisible();
  });
});

test.describe('Adaptive UI — no horizontal overflow', () => {
  for (const bp of BREAKPOINTS) {
    test(`no page overflows the viewport horizontally at ${bp.name}`, async ({ page }) => {
      // 16 full page loads (fresh SPA boot + Vite on-demand compile per route)
      // comfortably exceed the default 30s test budget.
      test.setTimeout(150_000);
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await loginAsUi(page, 'ADMIN');

      const findings: string[] = [];
      for (const route of PAGES) {
        await page.goto(`/${route}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(200);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow > 2) findings.push(`${route}: ${overflow}px`);
      }

      expect(findings, `pages with horizontal overflow at ${bp.name}`).toEqual([]);
    });
  }
});
