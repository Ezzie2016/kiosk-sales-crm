/**
 * Business categories (spec §3). Like sources, this list is expected to grow;
 * same storage strategy (`text` + CHECK, canonical copy here, reference-table
 * promotion is a documented follow-up).
 */
export const BUSINESS_CATEGORIES = [
  'provision_store',
  'mini_mart',
  'fashion',
  'beauty',
  'food',
  'electronics',
  'pharmacy',
  'general_retail',
  'other',
] as const;

export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];

export const BUSINESS_CATEGORY_LABEL: Record<BusinessCategory, string> = {
  provision_store: 'Provision Store',
  mini_mart: 'Mini Mart',
  fashion: 'Fashion',
  beauty: 'Beauty',
  food: 'Food',
  electronics: 'Electronics',
  pharmacy: 'Pharmacy',
  general_retail: 'General Retail',
  other: 'Other',
};

export function isBusinessCategory(value: unknown): value is BusinessCategory {
  return typeof value === 'string' && (BUSINESS_CATEGORIES as readonly string[]).includes(value);
}
