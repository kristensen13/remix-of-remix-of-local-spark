import { supabase } from '@/integrations/supabase/client';
import { Business } from '@/data/mockData';

export interface SearchParams {
  postalCode?: string;
  city?: string;
  businessName?: string;
  category?: string;
}

interface SearchBusinessesResponse {
  success: boolean;
  businesses?: Business[];
  postalCode?: string;
  center?: { lat: number; lng: number };
  error?: string;
}

export async function searchBusinesses(params: SearchParams): Promise<SearchBusinessesResponse> {
  const { data, error } = await supabase.functions.invoke('search-businesses', {
    body: params,
  });

  if (error) {
    console.error('Error calling search-businesses:', error);
    return { success: false, error: error.message };
  }

  return data;
}
