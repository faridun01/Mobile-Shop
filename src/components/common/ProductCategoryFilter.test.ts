import { expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ProductCategoryFilter, matchesProductCategory } from './ProductCategoryFilter';

it('separates legacy phones, tablets and accessories', () => {
  expect(matchesProductCategory({ category: undefined }, 'PHONE')).toBe(true);
  expect(matchesProductCategory({ category: 'TABLET' }, 'PHONE')).toBe(false);
  expect(matchesProductCategory({ category: 'TABLET' }, 'TABLET')).toBe(true);
  expect(matchesProductCategory({ category: 'TABLET' }, 'ACCESSORY')).toBe(false);
});
it('renders all categories with an accessible selected tablet filter', () => {
  const html = renderToString(React.createElement(ProductCategoryFilter, { value: 'TABLET', onChange: () => {} }));
  expect(html).toContain('Планшеты');
  expect(html).toContain('Аксессуары');
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
});
