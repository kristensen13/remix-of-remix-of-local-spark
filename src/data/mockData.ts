export interface Business {
  id: string;
  name: string;
  address: string;
  phone: string;
  category: string;
  postalCode: string;
  lat: number;
  lng: number;
  temperature: 'hot' | 'warm' | 'cool' | 'cold';
  score: number;
  potentialReason: string;
  hasWebsite: boolean | null; // null = desconocido (datos básicos), true/false = confirmado
  website?: string; // URL de la página web si tiene
  rating?: number | null;
  reviewCount?: number | null;
  openingHours?: string;
  searchedPostalCode?: string; // CP buscado para comparar
  postalCodeMatch?: boolean; // Si coincide exactamente con el CP buscado
  needsDetails?: boolean; // true = solo tiene datos básicos de Nearby Search
}

export interface CreatedWebsite {
  id: string;
  businessId: string;
  businessName: string;
  category: string;
  createdAt: string;
  previewUrl: string;
  zipUrl: string;
  thumbnail?: string;
}
