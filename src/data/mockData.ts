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

export const mockBusinesses: Business[] = [
  // CP 28001 - Centro Madrid
  {
    id: '1',
    name: 'Zapatería El Caminante',
    address: 'Calle Mayor 15, Madrid',
    phone: '+34 912 345 678',
    category: 'Zapatería',
    postalCode: '28001',
    lat: 40.4168,
    lng: -3.7038,
    temperature: 'hot',
    score: 95,
    potentialReason: 'Alto potencial: Catálogo online, venta e-commerce, fidelización de clientes. La industria del calzado tiene un 40% de ventas online.',
    hasWebsite: false,
    rating: 4.5,
    reviewCount: 127,
    openingHours: 'L-V 10:00-20:00, S 10:00-14:00',
  },
  {
    id: '2',
    name: 'Ferretería Industrial López',
    address: 'Avenida del Sol 42, Madrid',
    phone: '+34 913 456 789',
    category: 'Ferretería',
    postalCode: '28001',
    lat: 40.4195,
    lng: -3.7105,
    temperature: 'hot',
    score: 92,
    potentialReason: 'Catálogo extenso ideal para web, pedidos B2B, gestión de stock online. Sector con crecimiento digital del 35%.',
    hasWebsite: false,
    rating: 4.8,
    reviewCount: 89,
    openingHours: 'L-V 8:00-19:00, S 9:00-14:00',
  },
  {
    id: '3',
    name: 'Óptica Visión Clara',
    address: 'Plaza España 8, Madrid',
    phone: '+34 914 567 890',
    category: 'Óptica',
    postalCode: '28001',
    lat: 40.4225,
    lng: -3.7125,
    temperature: 'hot',
    score: 88,
    potentialReason: 'Reserva citas online, catálogo de monturas, prueba virtual de gafas. Sector óptico con 50% de búsquedas online.',
    hasWebsite: false,
    rating: 4.7,
    reviewCount: 203,
    openingHours: 'L-S 10:00-20:00',
  },
  {
    id: '4',
    name: 'Floristería Rosa Blanca',
    address: 'Calle Serrano 23, Madrid',
    phone: '+34 915 678 901',
    category: 'Floristería',
    postalCode: '28001',
    lat: 40.4145,
    lng: -3.6985,
    temperature: 'warm',
    score: 75,
    potentialReason: 'Pedidos online para eventos, catálogo visual, suscripciones florales. Mercado en crecimiento pero muy competido.',
    hasWebsite: false,
    rating: 4.6,
    reviewCount: 156,
    openingHours: 'L-S 9:00-21:00, D 10:00-14:00',
  },
  // CP 28002 - Salamanca
  {
    id: '5',
    name: 'Joyería Diamante Azul',
    address: 'Calle Goya 120, Madrid',
    phone: '+34 916 111 222',
    category: 'Joyería',
    postalCode: '28002',
    lat: 40.4280,
    lng: -3.6780,
    temperature: 'hot',
    score: 98,
    potentialReason: 'Catálogo de alta gama, citas privadas, e-commerce premium. Sector joyería con alto ticket medio online.',
    hasWebsite: false,
    rating: 4.9,
    reviewCount: 89,
    openingHours: 'L-S 10:00-20:30',
  },
  {
    id: '6',
    name: 'Relojería Suiza',
    address: 'Calle Serrano 85, Madrid',
    phone: '+34 916 222 333',
    category: 'Relojería',
    postalCode: '28002',
    lat: 40.4310,
    lng: -3.6820,
    temperature: 'hot',
    score: 94,
    potentialReason: 'Catálogo exclusivo, servicio de reparación online, clientela internacional.',
    hasWebsite: false,
    rating: 4.8,
    reviewCount: 67,
    openingHours: 'L-V 10:00-19:00, S 11:00-14:00',
  },
  {
    id: '7',
    name: 'Boutique Elegance',
    address: 'Calle Velázquez 50, Madrid',
    phone: '+34 916 333 444',
    category: 'Moda',
    postalCode: '28002',
    lat: 40.4295,
    lng: -3.6850,
    temperature: 'warm',
    score: 78,
    potentialReason: 'Lookbook online, reserva de prendas, newsletter de temporada.',
    hasWebsite: false,
    rating: 4.5,
    reviewCount: 134,
    openingHours: 'L-S 10:00-21:00',
  },
  // CP 28003 - Chamberí
  {
    id: '8',
    name: 'Librería Antígona',
    address: 'Calle Fuencarral 75, Madrid',
    phone: '+34 917 444 555',
    category: 'Librería',
    postalCode: '28003',
    lat: 40.4320,
    lng: -3.7020,
    temperature: 'warm',
    score: 72,
    potentialReason: 'Catálogo online, eventos literarios, club de lectura digital.',
    hasWebsite: false,
    rating: 4.7,
    reviewCount: 256,
    openingHours: 'L-S 10:00-21:00, D 11:00-14:00',
  },
  {
    id: '9',
    name: 'Gimnasio Iron Fit',
    address: 'Calle Luchana 33, Madrid',
    phone: '+34 917 555 666',
    category: 'Gimnasio',
    postalCode: '28003',
    lat: 40.4350,
    lng: -3.7050,
    temperature: 'hot',
    score: 90,
    potentialReason: 'Reserva clases online, planes de entrenamiento, tienda de suplementos.',
    hasWebsite: false,
    rating: 4.6,
    reviewCount: 412,
    openingHours: 'L-D 7:00-23:00',
  },
  {
    id: '10',
    name: 'Panadería La Tahona',
    address: 'Calle Ponzano 22, Madrid',
    phone: '+34 917 666 777',
    category: 'Panadería',
    postalCode: '28003',
    lat: 40.4380,
    lng: -3.6980,
    temperature: 'cool',
    score: 45,
    potentialReason: 'Negocio local, encargos especiales. Bajo potencial e-commerce.',
    hasWebsite: false,
    rating: 4.8,
    reviewCount: 189,
    openingHours: 'L-S 7:00-20:00, D 8:00-14:00',
  },
  // CP 08001 - Barcelona Centro
  {
    id: '11',
    name: 'Guitarras Flamenco',
    address: 'La Rambla 45, Barcelona',
    phone: '+34 933 111 222',
    category: 'Instrumentos',
    postalCode: '08001',
    lat: 41.3825,
    lng: 2.1730,
    temperature: 'hot',
    score: 96,
    potentialReason: 'E-commerce internacional, tutoriales, venta de accesorios.',
    hasWebsite: false,
    rating: 4.9,
    reviewCount: 178,
    openingHours: 'L-S 10:00-20:00',
  },
  {
    id: '12',
    name: 'Tienda de Skate Urban',
    address: 'Carrer dels Tallers 30, Barcelona',
    phone: '+34 933 222 333',
    category: 'Deportes',
    postalCode: '08001',
    lat: 41.3840,
    lng: 2.1695,
    temperature: 'hot',
    score: 91,
    potentialReason: 'Comunidad activa, e-commerce, contenido lifestyle.',
    hasWebsite: false,
    rating: 4.7,
    reviewCount: 234,
    openingHours: 'L-S 11:00-21:00',
  },
  {
    id: '13',
    name: 'Bar El Xampanyet',
    address: 'Carrer de Montcada 22, Barcelona',
    phone: '+34 933 333 444',
    category: 'Bar',
    postalCode: '08001',
    lat: 41.3855,
    lng: 2.1810,
    temperature: 'cold',
    score: 25,
    potentialReason: 'Negocio tradicional, clientela local. Web solo informativa.',
    hasWebsite: false,
    rating: 4.4,
    reviewCount: 567,
    openingHours: 'Ma-S 12:00-23:00',
  },
];

export const mockCreatedWebsites: CreatedWebsite[] = [
  {
    id: 'w1',
    businessId: '1',
    businessName: 'Zapatería El Caminante',
    category: 'Zapatería',
    createdAt: '2024-01-15',
    previewUrl: '/preview/zapateria-caminante',
    zipUrl: '/downloads/zapateria-caminante.zip',
  },
  {
    id: 'w2',
    businessId: '2',
    businessName: 'Ferretería Industrial López',
    category: 'Ferretería',
    createdAt: '2024-01-14',
    previewUrl: '/preview/ferreteria-lopez',
    zipUrl: '/downloads/ferreteria-lopez.zip',
  },
];
