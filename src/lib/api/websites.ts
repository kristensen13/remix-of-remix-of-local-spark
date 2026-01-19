import { supabase } from '@/integrations/supabase/client';
import { Business } from '@/data/mockData';
import JSZip from 'jszip';
import { getStoredSystemPrompt } from '@/components/SettingsModal';

export interface GeneratedWebsite {
  id: string;
  businessName: string;
  html: string;
  generatedAt: string;
  variant?: string;
}

export async function generateWebsite(business: Business): Promise<{ success: boolean; website?: GeneratedWebsite; error?: string }> {
  try {
    // Get the custom system prompt from localStorage
    const systemPrompt = getStoredSystemPrompt();
    
    const { data, error } = await supabase.functions.invoke('generate-website', {
      body: { business, systemPrompt }
    });

    if (error) {
      console.error('Error invoking generate-website:', error);
      return { success: false, error: error.message };
    }

    if (!data.success) {
      return { success: false, error: data.error };
    }

    const website: GeneratedWebsite = {
      id: `web-${Date.now()}`,
      businessName: data.businessName || business.name,
      html: data.html,
      generatedAt: data.generatedAt || new Date().toISOString(),
      variant: data.variant,
    };

    return { success: true, website };
  } catch (error) {
    console.error('Error generating website:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
  }
}

export async function downloadWebsiteAsZip(website: GeneratedWebsite): Promise<boolean> {
  try {
    console.log('Starting ZIP download for:', website.businessName);
    
    if (!website.html || website.html.trim() === '') {
      console.error('No HTML content to download');
      return false;
    }
    
    const zip = new JSZip();
    
    // Add the HTML file
    zip.file('index.html', website.html);
    
    // Add a README
    const readme = `# ${website.businessName} - Landing Page

Esta landing page fue generada automáticamente el ${new Date(website.generatedAt).toLocaleString('es-ES')}.

## Instrucciones de uso

1. Sube el archivo index.html a tu servidor web
2. O abre el archivo directamente en un navegador para previsualizarlo

## Personalización

Puedes editar el archivo index.html con cualquier editor de texto para:
- Cambiar textos y descripciones
- Modificar colores y estilos
- Añadir imágenes reales del negocio
- Actualizar información de contacto

---
Generado con ❤️ por WebScanner AI
`;
    
    zip.file('README.md', readme);
    
    console.log('Generating ZIP blob...');
    
    // Generate the ZIP file
    const blob = await zip.generateAsync({ type: 'blob' });
    
    console.log('ZIP blob generated, size:', blob.size);
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const rawName = website.businessName || website.id || 'website';
    const safeName = rawName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase();
    a.download = `${safeName || 'website'}-website.zip`;
    a.style.display = 'none';
    document.body.appendChild(a);
    
    console.log('Triggering download...');
    a.click();
    
    // Clean up after a short delay
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log('Download cleanup complete');
    }, 100);
    
    return true;
  } catch (error) {
    console.error('Error downloading ZIP:', error);
    return false;
  }
}
