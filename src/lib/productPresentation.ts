import type { Language, Product } from './store';

export type ProductSpecificationRow = {
  key: 'fabric' | 'technique';
  label: string;
  value: string;
};

export function getProductSpecificationRows(
  product: Pick<Product, 'fabric' | 'fabricAr' | 'technique' | 'techniqueAr'> | null,
  language: Language
): ProductSpecificationRow[] {
  if (!product) return [];

  const fabric = (language === 'ar' ? product.fabricAr : product.fabric)?.trim() || '';
  const technique = (language === 'ar' ? product.techniqueAr : product.technique)?.trim() || '';
  const rows: ProductSpecificationRow[] = [];

  if (fabric) {
    rows.push({
      key: 'fabric',
      label: language === 'ar' ? 'الخامة' : 'Fabric',
      value: fabric,
    });
  }

  if (technique) {
    rows.push({
      key: 'technique',
      label: language === 'ar' ? 'تقنية التطريز' : 'Technique',
      value: technique,
    });
  }

  return rows;
}
