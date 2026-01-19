import { supabase } from "@/integrations/supabase/client";

export interface BusinessDetails {
  phone: string;
  website: string | null;
  hasWebsite: boolean;
  rating: number | null;
  reviewCount: number | null;
  postalCode: string;
  fullAddress: string;
}

export async function getBusinessDetails(placeId: string): Promise<BusinessDetails> {
  const { data, error } = await supabase.functions.invoke('get-business-details', {
    body: { placeId }
  });

  if (error) {
    console.error('Error fetching business details:', error);
    throw new Error('Error al obtener detalles del negocio');
  }

  if (!data.success) {
    throw new Error(data.error || 'Error desconocido');
  }

  return data.details;
}
