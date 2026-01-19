import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Business {
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
  hasWebsite: boolean | null;
  rating?: number | null;
  reviewCount?: number | null;
  website?: string;
  searchedPostalCode?: string;
  postalCodeMatch?: boolean;
  needsDetails: boolean;
}

interface SearchParams {
  postalCode?: string;
  city?: string;
  businessName?: string;
  category?: string;
}

// Business types to search for - ALL types for maximum coverage
const BUSINESS_TYPES = [
  'store', 'restaurant', 'cafe', 'bar', 'bakery', 'beauty_salon',
  'hair_care', 'gym', 'dentist', 'doctor', 'pharmacy', 'clothing_store',
  'shoe_store', 'jewelry_store', 'florist', 'pet_store', 'car_repair',
  'electronics_store', 'furniture_store', 'book_store', 'hardware_store'
];

// Category mapping for Google Places types
const CATEGORY_TYPE_MAP: Record<string, string[]> = {
  'restaurante': ['restaurant', 'meal_takeaway', 'meal_delivery'],
  'cafeteria': ['cafe', 'coffee_shop'],
  'bar': ['bar', 'night_club'],
  'panaderia': ['bakery'],
  'peluqueria': ['hair_care', 'beauty_salon'],
  'gimnasio': ['gym', 'fitness_center'],
  'tienda': ['store', 'clothing_store', 'shoe_store'],
  'farmacia': ['pharmacy'],
  'dentista': ['dentist'],
  'medico': ['doctor', 'hospital', 'health'],
  'taller': ['car_repair', 'car_dealer'],
  'electronica': ['electronics_store'],
  'libreria': ['book_store'],
  'floristeria': ['florist'],
  'mascotas': ['pet_store', 'veterinary_care'],
  'joyeria': ['jewelry_store'],
  'muebles': ['furniture_store', 'home_goods_store'],
};

function normalizeString(str: string): string {
  return str.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Estimate temperature without knowing if has website (will be recalculated on demand)
function estimateTemperature(category: string): { temperature: 'hot' | 'warm' | 'cool' | 'cold'; score: number; reason: string } {
  const hotCategories = ['shoe', 'zapater', 'hardware', 'ferreter', 'optician', 'óptica', 'optica', 'jewelry', 'joyer', 'watch', 'relojer', 'gym', 'gimnasio', 'clinic', 'clínica', 'clinica', 'dental', 'dentist', 'instrument', 'sport', 'deporte', 'electronics', 'electrónica', 'electronica', 'computer', 'informática', 'informatica', 'plumber', 'fontaner', 'electrician', 'electric', 'reform', 'construcción', 'construccion', 'mechanic', 'taller', 'auto', 'car repair'];
  const warmCategories = ['florist', 'florister', 'book', 'librer', 'fashion', 'moda', 'boutique', 'hair', 'peluquer', 'beauty', 'estética', 'estetica', 'restaurant', 'restaurante', 'cafe', 'cafeter', 'bar', 'brewery', 'cervecer', 'grill', 'asador', 'pizza', 'tapas', 'bakery', 'pasteler'];
  const coolCategories = ['bakery', 'panader', 'fruit', 'fruter', 'butcher', 'carnicer', 'fish', 'pescader', 'haberdashery', 'mercer', 'delicatessen', 'charcuter', 'grocery', 'alimentación', 'alimentacion', 'supermarket'];
  
  const lowerCategory = category.toLowerCase();
  
  if (hotCategories.some(c => lowerCategory.includes(c))) {
    return { 
      temperature: 'warm', // Start as warm, upgrade to hot when we confirm no website
      score: 70 + Math.floor(Math.random() * 15), 
      reason: `Potencial por confirmar: Posible catálogo online, reservas, e-commerce.` 
    };
  }
  
  if (warmCategories.some(c => lowerCategory.includes(c))) {
    return { 
      temperature: 'warm', 
      score: 55 + Math.floor(Math.random() * 15), 
      reason: `Potencial medio estimado: Reservas online, galería, menú digital.` 
    };
  }
  
  if (coolCategories.some(c => lowerCategory.includes(c))) {
    return { 
      temperature: 'cool', 
      score: 35 + Math.floor(Math.random() * 15), 
      reason: `Potencial moderado: Web informativa, horarios, contacto.` 
    };
  }
  
  return { 
    temperature: 'warm', 
    score: 50 + Math.floor(Math.random() * 20), 
    reason: `Potencial por evaluar: Presencia digital básica recomendada.` 
  };
}

async function geocodeLocation(query: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)},Spain&key=${apiKey}`
    );
    const data = await response.json();
    
    if (data.status === 'OK' && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      return { lat: location.lat, lng: location.lng };
    }
  } catch (error) {
    console.error('Geocoding error:', error);
  }
  return null;
}

async function searchPlaces(apiKey: string, lat: number, lng: number, type: string, keyword?: string, pageToken?: string): Promise<any> {
  let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=500&type=${type}&key=${apiKey}`;
  
  if (keyword) {
    url += `&keyword=${encodeURIComponent(keyword)}`;
  }
  
  if (pageToken) {
    url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${pageToken}&key=${apiKey}`;
  }
  
  const response = await fetch(url);
  return response.json();
}

async function textSearchPlaces(apiKey: string, query: string, location?: { lat: number; lng: number }): Promise<any> {
  let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;
  
  if (location) {
    url += `&location=${location.lat},${location.lng}&radius=10000`;
  }
  
  const response = await fetch(url);
  return response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const params: SearchParams = await req.json();
    const { postalCode, city, businessName, category } = params;

    if (!postalCode && !city && !businessName && !category) {
      return new Response(
        JSON.stringify({ success: false, error: 'Se requiere al menos un criterio de búsqueda' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      console.error('GOOGLE_MAPS_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Google Maps API no configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Searching with params:', params);

    // Determine the center location
    let center: { lat: number; lng: number } | null = null;
    let locationQuery = '';

    if (postalCode) {
      locationQuery = postalCode;
    } else if (city) {
      locationQuery = city;
    }

    if (locationQuery) {
      center = await geocodeLocation(locationQuery, apiKey);
    }

    if (!center) {
      // Default to Madrid if no location found
      center = { lat: 40.4168, lng: -3.7038 };
    }

    console.log('Search center:', center);

    const allPlaces: any[] = [];
    const seenPlaceIds = new Set<string>();

    // Determine which types to search based on category
    // If no category specified, search ALL types for maximum coverage
    let typesToSearch = BUSINESS_TYPES;
    
    if (category) {
      const normalizedCategory = normalizeString(category);
      for (const [key, types] of Object.entries(CATEGORY_TYPE_MAP)) {
        if (normalizedCategory.includes(key) || key.includes(normalizedCategory)) {
          typesToSearch = types;
          break;
        }
      }
    }

    console.log(`Will search ${typesToSearch.length} business types`);

    // If businessName is provided, use text search
    if (businessName) {
      let searchQuery = businessName;
      if (city) searchQuery += ` ${city}`;
      if (postalCode) searchQuery += ` ${postalCode}`;
      if (category) searchQuery += ` ${category}`;
      
      console.log('Text search query:', searchQuery);
      
      const data = await textSearchPlaces(apiKey, searchQuery, center);
      
      if (data.status === 'OK' && data.results) {
        for (const place of data.results) {
          if (!seenPlaceIds.has(place.place_id)) {
            seenPlaceIds.add(place.place_id);
            allPlaces.push(place);
          }
        }
      }
    } else {
      // Use nearby search with types - search ALL types
      for (const type of typesToSearch) {
        try {
          console.log(`Searching for type: ${type}`);
          const data = await searchPlaces(apiKey, center.lat, center.lng, type, category);
          
          if (data.status === 'OK' && data.results) {
            for (const place of data.results) {
              if (!seenPlaceIds.has(place.place_id)) {
                seenPlaceIds.add(place.place_id);
                allPlaces.push(place);
              }
            }
            
            // Get next page if available for maximum coverage
            if (data.next_page_token) {
              await new Promise(resolve => setTimeout(resolve, 2000));
              const page2 = await searchPlaces(apiKey, center.lat, center.lng, type, category, data.next_page_token);
              if (page2.status === 'OK' && page2.results) {
                for (const place of page2.results) {
                  if (!seenPlaceIds.has(place.place_id)) {
                    seenPlaceIds.add(place.place_id);
                    allPlaces.push(place);
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error(`Error searching type ${type}:`, error);
        }
      }
    }

    console.log(`Found ${allPlaces.length} unique places total`);

    // Type mapping for category detection from place types
    const typeMapping: Record<string, string> = {
      'shoe_store': 'Zapatería',
      'hardware_store': 'Ferretería',
      'jewelry_store': 'Joyería',
      'florist': 'Floristería',
      'bakery': 'Panadería',
      'hair_care': 'Peluquería',
      'beauty_salon': 'Centro de estética',
      'restaurant': 'Restaurante',
      'cafe': 'Cafetería',
      'bar': 'Bar',
      'gym': 'Gimnasio',
      'clothing_store': 'Tienda de ropa',
      'electronics_store': 'Electrónica',
      'book_store': 'Librería',
      'pet_store': 'Tienda de mascotas',
      'furniture_store': 'Mueblería',
      'home_goods_store': 'Hogar y decoración',
      'pharmacy': 'Farmacia',
      'dentist': 'Dentista',
      'doctor': 'Clínica médica',
      'car_repair': 'Taller mecánico',
      'store': 'Comercio',
    };
    
    // Process places using ONLY Nearby Search data (no Place Details calls!)
    const businesses: Business[] = allPlaces.map((place) => {
      // Detect category from place types
      let businessCategory = 'Comercio local';
      for (const type of place.types || []) {
        if (typeMapping[type]) {
          businessCategory = typeMapping[type];
          break;
        }
      }
      
      // Estimate temperature without knowing website status
      const { temperature, score, reason } = estimateTemperature(businessCategory);
      
      const placeLat = place.geometry?.location?.lat;
      const placeLng = place.geometry?.location?.lng;
      
      // Try to extract postal code from vicinity (simplified address)
      let businessPostalCode = '';
      if (place.vicinity) {
        const cpMatch = place.vicinity.match(/\b(0[1-9]\d{3}|[1-4]\d{4}|5[0-2]\d{3})\b/);
        if (cpMatch) {
          businessPostalCode = cpMatch[1];
        }
      }
      
      return {
        id: place.place_id,
        name: place.name,
        address: place.vicinity || '', // Simplified address from Nearby Search
        phone: '', // Will be loaded on demand
        category: businessCategory,
        postalCode: businessPostalCode,
        lat: placeLat,
        lng: placeLng,
        temperature,
        score,
        potentialReason: reason,
        hasWebsite: null, // Unknown - will be loaded on demand
        website: undefined,
        rating: null, // Will be loaded on demand
        reviewCount: null, // Will be loaded on demand
        searchedPostalCode: postalCode || '',
        postalCodeMatch: !postalCode || !businessPostalCode || businessPostalCode === postalCode,
        needsDetails: true, // Flag indicating we need to fetch details on demand
      } as Business;
    });

    // Sort by: 1) Postal code match first, 2) Score descending
    businesses.sort((a, b) => {
      if (a.postalCodeMatch !== b.postalCodeMatch) {
        return a.postalCodeMatch ? -1 : 1;
      }
      return b.score - a.score;
    });

    console.log('=== SEARCH SUMMARY ===');
    console.log('Total places found:', allPlaces.length);
    console.log('Returning businesses:', businesses.length);
    console.log('Place Details calls:', 0, '(loaded on demand)');

    return new Response(
      JSON.stringify({ 
        success: true, 
        businesses,
        postalCode: postalCode || '',
        center
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error searching businesses:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
