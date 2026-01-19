import { supabase } from '@/integrations/supabase/client';
import { GeneratedWebsite } from '@/lib/api/websites';

export interface StoredWebsite extends GeneratedWebsite {
  category: string;
  address: string;
  phone: string;
}

// Database interface matching the table schema
interface DbWebsite {
  id: string;
  business_name: string;
  html_content: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  created_at: string;
}

// Convert database record to StoredWebsite
function dbToStoredWebsite(db: DbWebsite): StoredWebsite {
  return {
    id: db.id,
    businessName: db.business_name,
    html: db.html_content,
    generatedAt: db.created_at,
    category: db.category || '',
    address: db.address || '',
    phone: db.phone || '',
  };
}

// Fetch all websites from database
export async function getStoredWebsites(): Promise<StoredWebsite[]> {
  try {
    const { data, error } = await supabase
      .from('generated_websites')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching websites:', error);
      return [];
    }

    return (data || []).map(dbToStoredWebsite);
  } catch (error) {
    console.error('Error fetching websites:', error);
    return [];
  }
}

// Save a website to database
export async function saveWebsite(website: StoredWebsite): Promise<boolean> {
  try {
    console.log('Saving website to database:', {
      id: website.id,
      business_name: website.businessName,
      category: website.category,
      address: website.address,
      phone: website.phone,
      html_length: website.html?.length || 0,
    });
    
    const { data, error } = await supabase.from('generated_websites').insert({
      business_name: website.businessName,
      html_content: website.html,
      category: website.category || 'Sin categoría',
      address: website.address || '',
      phone: website.phone || '',
    }).select();

    if (error) {
      console.error('Error saving website to DB:', error);
      return false;
    }

    console.log('Website saved successfully:', data);
    return true;
  } catch (error) {
    console.error('Exception saving website:', error);
    return false;
  }
}

// Delete a website from database
export async function deleteWebsite(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('generated_websites')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting website:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error deleting website:', error);
    return false;
  }
}

// Clear all websites from database
export async function clearAllWebsites(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('generated_websites')
      .delete()
      .neq('id', '');

    if (error) {
      console.error('Error clearing websites:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error clearing websites:', error);
    return false;
  }
}
