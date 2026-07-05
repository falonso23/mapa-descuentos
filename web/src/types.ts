export interface Benefit {
  provider: string;
  product: string | null;
  amount: string | null;
  days: string | null;
  conditions: string | null;
}

export interface MerchantLocation {
  lat: number;
  lng: number;
  address: string | null;
  sucursal: string | null;
  confidence: number | null;
  precision: string;
  source: string;
}

export interface Merchant {
  id: number;
  merchant: string;
  category: string;
  providers: string[];
  benefits: Benefit[];
  es_cadena: boolean;
  locations: MerchantLocation[];
}

export interface FilterState {
  providers: Set<string>;
  categories: Set<string>;
  query: string;
}
