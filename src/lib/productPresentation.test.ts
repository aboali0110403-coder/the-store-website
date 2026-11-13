import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getProductSpecificationRows } from './productPresentation';
import { getInitialArtisanProducts, initialArtisanProducts } from './store';

const completeSpecs = {
  fabric: 'Egyptian silk-linen',
  fabricAr: 'كتان وحرير مصري',
  technique: 'Traditional satin stitch',
  techniqueAr: 'غرزة ساتان تقليدية',
};

test('production catalog seed is empty while development retains the curated Lotus fixture', () => {
  assert.deepEqual(getInitialArtisanProducts(false), []);
  assert.ok(getInitialArtisanProducts(true).some((product) => product.slug === 'lotus-heirloom-dress'));
  assert.deepEqual(initialArtisanProducts, []);
});

test('empty or whitespace-only Fabric and Technique values produce no visible specification rows', () => {
  assert.deepEqual(
    getProductSpecificationRows(
      { fabric: '', fabricAr: '', technique: '   ', techniqueAr: '' },
      'en'
    ),
    []
  );
});

test('valid Fabric and Technique values remain visible in English and Arabic', () => {
  assert.deepEqual(getProductSpecificationRows(completeSpecs, 'en'), [
    { key: 'fabric', label: 'Fabric', value: 'Egyptian silk-linen' },
    { key: 'technique', label: 'Technique', value: 'Traditional satin stitch' },
  ]);
  assert.deepEqual(getProductSpecificationRows(completeSpecs, 'ar'), [
    { key: 'fabric', label: 'الخامة', value: 'كتان وحرير مصري' },
    { key: 'technique', label: 'تقنية التطريز', value: 'غرزة ساتان تقليدية' },
  ]);
});

test('one empty specification is omitted without hiding the other valid value', () => {
  assert.deepEqual(
    getProductSpecificationRows(
      { ...completeSpecs, fabric: '   ', fabricAr: '' },
      'en'
    ),
    [{ key: 'technique', label: 'Technique', value: 'Traditional satin stitch' }]
  );
});

test('direct product lookup is restricted to published database records', () => {
  const source = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
  const detailsLookup = source
    .split('export async function fetchProductBySlug')[1]
    ?.split('/**\n * Fetch active shipping rates')[0];

  assert.ok(detailsLookup);
  assert.match(detailsLookup, /\.eq\('is_published', true\)/);
  assert.match(detailsLookup, /\.eq\('slug', slug\)/);
});
