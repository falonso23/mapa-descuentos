import {
  Utensils,
  Shirt,
  Footprints,
  Sofa,
  Pill,
  Sparkles,
  ShoppingCart,
  Clapperboard,
  Laptop,
  Baby,
  Tag,
  type LucideIcon,
} from 'lucide-react';

export interface CategoryMeta {
  label: string;
  icon: LucideIcon;
  color: string;
}

export const CATEGORIES = {
  gastronomia: { label: 'Gastronomía', icon: Utensils, color: '#ef4444' },
  moda: { label: 'Moda', icon: Shirt, color: '#ec4899' },
  calzado: { label: 'Calzado', icon: Footprints, color: '#a855f7' },
  hogar: { label: 'Hogar', icon: Sofa, color: '#f59e0b' },
  salud: { label: 'Salud', icon: Pill, color: '#10b981' },
  bienestar: { label: 'Bienestar', icon: Sparkles, color: '#14b8a6' },
  supermercado: { label: 'Supermercado', icon: ShoppingCart, color: '#3b82f6' },
  entretenimiento: { label: 'Entretenimiento', icon: Clapperboard, color: '#8b5cf6' },
  tecnologia: { label: 'Tecnología', icon: Laptop, color: '#06b6d4' },
  ninos: { label: 'Niños', icon: Baby, color: '#f472b6' },
  otros: { label: 'Otros', icon: Tag, color: '#94a3b8' },
} as const satisfies Record<string, CategoryMeta>;

export type CategoryKey = keyof typeof CATEGORIES;

export function categoryOf(category: string): CategoryMeta {
  return (CATEGORIES as Record<string, CategoryMeta>)[category] ?? CATEGORIES.otros;
}
