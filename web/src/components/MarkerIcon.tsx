import { categoryOf } from '../data/categories';

export function MarkerIcon({ category }: { category: string }) {
  const cat = categoryOf(category);
  const Icon = cat.icon;
  return (
    <div className="marker-pin" style={{ background: cat.color }}>
      <Icon size={15} strokeWidth={2.25} color="#fff" aria-hidden />
    </div>
  );
}
