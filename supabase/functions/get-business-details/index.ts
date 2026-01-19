import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BusinessDetails {
  phone: string;
  website: string | null;
  hasWebsite: boolean;
  rating: number | null;
  reviewCount: number | null;
  postalCode: string;
  fullAddress: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { placeId } = await req.json();

    if (!placeId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Se requiere placeId' }),
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

    console.log('Getting details for place:', placeId);

    // Only request the fields we need (Contact + Basic data)
    // Contact Data: formatted_phone_number ($3/1000)
    // Basic Data: website, formatted_address, address_components (free with place)
    // Atmosphere Data: rating, user_ratings_total ($5/1000) - optional, keeping for now
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=formatted_phone_number,website,formatted_address,address_components,rating,user_ratings_total&key=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      console.error('Place Details API error:', data.status, data.error_message);
      return new Response(
        JSON.stringify({ success: false, error: `Error de API: ${data.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const details = data.result;

    // Extract postal code from address_components
    const addressComponents = details.address_components || [];
    const postalCodeComponent = addressComponents.find((c: any) => 
      c.types?.includes('postal_code')
    );
    let postalCode = postalCodeComponent?.long_name || '';

    // If no postal code in components, try to extract from formatted_address
    if (!postalCode && details.formatted_address) {
      const cpMatch = details.formatted_address.match(/\b(0[1-9]\d{3}|[1-4]\d{4}|5[0-2]\d{3})\b/);
      if (cpMatch) {
        postalCode = cpMatch[1];
      }
    }

    const businessDetails: BusinessDetails = {
      phone: details.formatted_phone_number || '',
      website: details.website || null,
      hasWebsite: !!details.website,
      rating: details.rating || null,
      reviewCount: details.user_ratings_total || null,
      postalCode,
      fullAddress: details.formatted_address || '',
    };

    console.log('Returning details:', businessDetails);

    return new Response(
      JSON.stringify({ success: true, details: businessDetails }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error getting business details:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
