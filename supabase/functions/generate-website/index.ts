import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Business {
  name: string;
  category: string;
  address?: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviews?: number;
  priceLevel?: string;
  openingHours?: string[];
  photos?: string[];
  lat?: number;
  lng?: number;
}

function cleanHtml(raw: string): string {
  if (!raw) return "";
  let html = raw.trim();
  html = html.replace(/^```html?\s*/i, "").replace(/```\s*$/, "");
  return html.trim();
}

function isHtmlComplete(html: string): boolean {
  const hasDoctype = html.toLowerCase().includes("<!doctype html");
  const hasClosingHtml = html.toLowerCase().includes("</html>");
  const hasClosingBody = html.toLowerCase().includes("</body>");
  const hasClosingStyle = html.toLowerCase().includes("</style>");
  const hasClosingHead = html.toLowerCase().includes("</head>");

  return hasDoctype && hasClosingHtml && hasClosingBody && hasClosingStyle && hasClosingHead;
}

// Mapeo de categorías a IDs de fotos REALES de Unsplash (curadas y relevantes)
// Cada categoría tiene 3 fotos: hero, gallery1, gallery2
const CURATED_IMAGES: Record<string, { hero: string; gallery1: string; gallery2: string }> = {
  // Estética / Spa / Belleza
  "estética": {
    hero: "https://images.unsplash.com/photo-1560750588-73207b1ef5b8?w=1600&h=900&fit=crop",
    gallery1: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800&h=600&fit=crop",
    gallery2: "https://images.unsplash.com/photo-1519824145371-296894a0daa9?w=800&h=600&fit=crop",
  },
  "spa": {
    hero: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=1600&h=900&fit=crop",
    gallery1: "https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=800&h=600&fit=crop",
    gallery2: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800&h=600&fit=crop",
  },
  "belleza": {
    hero: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=1600&h=900&fit=crop",
    gallery1: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=800&h=600&fit=crop",
    gallery2: "https://images.unsplash.com/photo-1596755389378-c31d21fd1273?w=800&h=600&fit=crop",
  },
  // Peluquería / Barbería
  "peluquería": {
    hero: "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1600&h=900&fit=crop",
    gallery1: "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800&h=600&fit=crop",
    gallery2: "https://images.unsplash.com/photo-1562322140-8baeececf3df?w=800&h=600&fit=crop",
  },
  "barbería": {
    hero: "https://images.unsplash.com/photo-1503951914875-452f1a97cbb4?w=1600&h=900&fit=crop",
    gallery1: "https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800&h=600&fit=crop",
    gallery2: "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=800&h=600&fit=crop",
  },
  // Restaurante / Bar / Café
  "restaurante": {
    hero: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&h=900&fit=crop",
    gallery1: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&h=600&fit=crop",
    gallery2: "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&h=600&fit=crop",
  },
  "bar": {
    hero: "https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=1600&h=900&fit=crop",
    gallery1: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=800&h=600&fit=crop",
    gallery2: "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=800&h=600&fit=crop",
  },
  "cafetería": {
    hero: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=1600&h=900&fit=crop",
    gallery1: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&h=600&fit=crop",
    gallery2: "https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=800&h=600&fit=crop",
  },
  // Gimnasio / Fitness
  "gimnasio": {
    hero: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1600&h=900&fit=crop",
    gallery1: "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=800&h=600&fit=crop",
    gallery2: "https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=800&h=600&fit=crop",
  },
  // Clínica / Dentista / Médico
  "clínica": {
    hero: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=1600&h=900&fit=crop",
    gallery1: "https://images.unsplash.com/photo-1581595220892-b0739db3ba8c?w=800&h=600&fit=crop",
    gallery2: "https://images.unsplash.com/photo-1551076805-e1869033e561?w=800&h=600&fit=crop",
  },
  "dentista": {
    hero: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=1600&h=900&fit=crop",
    gallery1: "https://images.unsplash.com/photo-1606811841689-23dfddce3e95?w=800&h=600&fit=crop",
    gallery2: "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=800&h=600&fit=crop",
  },
  // Hotel / Alojamiento
  "hotel": {
    hero: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1600&h=900&fit=crop",
    gallery1: "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800&h=600&fit=crop",
    gallery2: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&h=600&fit=crop",
  },
  // Tienda / Retail
  "tienda": {
    hero: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1600&h=900&fit=crop",
    gallery1: "https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=800&h=600&fit=crop",
    gallery2: "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=800&h=600&fit=crop",
  },
  // Floristería
  "floristería": {
    hero: "https://images.unsplash.com/photo-1487530811176-3780de880c2d?w=1600&h=900&fit=crop",
    gallery1: "https://images.unsplash.com/photo-1561181286-d3fee7d55364?w=800&h=600&fit=crop",
    gallery2: "https://images.unsplash.com/photo-1508610048659-a06b669e3321?w=800&h=600&fit=crop",
  },
  // Panadería / Pastelería
  "panadería": {
    hero: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1600&h=900&fit=crop",
    gallery1: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=800&h=600&fit=crop",
    gallery2: "https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=800&h=600&fit=crop",
  },
  // Veterinario
  "veterinario": {
    hero: "https://images.unsplash.com/photo-1628009368231-7bb7cfcb0def?w=1600&h=900&fit=crop",
    gallery1: "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=800&h=600&fit=crop",
    gallery2: "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&h=600&fit=crop",
  },
  // Inmobiliaria
  "inmobiliaria": {
    hero: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1600&h=900&fit=crop",
    gallery1: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800&h=600&fit=crop",
    gallery2: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&h=600&fit=crop",
  },
  // Abogado / Legal
  "abogado": {
    hero: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=1600&h=900&fit=crop",
    gallery1: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800&h=600&fit=crop",
    gallery2: "https://images.unsplash.com/photo-1521791055366-0d553872125f?w=800&h=600&fit=crop",
  },
  // Taller / Mecánico
  "taller": {
    hero: "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=1600&h=900&fit=crop",
    gallery1: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=600&fit=crop",
    gallery2: "https://images.unsplash.com/photo-1625047509168-a7026f36de04?w=800&h=600&fit=crop",
  },
  // Farmacia
  "farmacia": {
    hero: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=1600&h=900&fit=crop",
    gallery1: "https://images.unsplash.com/photo-1576602976047-174e57a47881?w=800&h=600&fit=crop",
    gallery2: "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=800&h=600&fit=crop",
  },
  // Default genérico (profesional/negocio)
  "default": {
    hero: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1600&h=900&fit=crop",
    gallery1: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800&h=600&fit=crop",
    gallery2: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&h=600&fit=crop",
  },
};

// Obtener imágenes curadas según la categoría del negocio
function generateStockImageUrls(business: Business): { hero: string; gallery1: string; gallery2: string } {
  const cat = (business.category || "").toLowerCase();
  
  // Buscar coincidencia parcial en las categorías curadas
  for (const [key, images] of Object.entries(CURATED_IMAGES)) {
    if (key !== "default" && cat.includes(key)) {
      console.log(`Using curated images for category: ${key}`);
      return images;
    }
  }
  
  // Si no hay coincidencia, usar default
  console.log("Using default curated images (no category match)");
  return CURATED_IMAGES.default;
}

// Simple hash function para generar seed consistente
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

// Forzar reemplazo de TODAS las imágenes por URLs de Picsum
function forceReplaceImages(html: string, stockImages: { hero: string; gallery1: string; gallery2: string }): string {
  let result = html;
  
  // Primero: intentar reemplazar placeholders (por si Gemini los usó)
  result = result.replaceAll("__HERO_IMAGE_URL__", stockImages.hero);
  result = result.replaceAll("__GALLERY_IMAGE_1__", stockImages.gallery1);
  result = result.replaceAll("__GALLERY_IMAGE_2__", stockImages.gallery2);
  
  // Segundo: Reemplazar CUALQUIER URL de imagen que no sea picsum
  // Esto captura src="..." y src='...'
  const imgSrcRegex = /(<img[^>]+src=["'])([^"']+)(["'][^>]*>)/gi;
  
  let imageIndex = 0;
  const imageUrls = [stockImages.hero, stockImages.gallery1, stockImages.gallery2];
  
  result = result.replace(imgSrcRegex, (match, before, src, after) => {
    // Si ya es picsum, mantener
    if (src.includes('picsum.photos')) {
      return match;
    }
    // Reemplazar con nuestras URLs rotando entre hero/gallery1/gallery2
    const newUrl = imageUrls[imageIndex % imageUrls.length];
    imageIndex++;
    return before + newUrl + after;
  });
  
  console.log(`Total images replaced with Picsum: ${imageIndex}`);
  return result;
}

// A veces el HTML generado oculta secciones (p.ej. .reveal { opacity: 0 })
// y luego el JS de activación viene roto. Esto inyecta un runtime mínimo y robusto
// para que el contenido SIEMPRE sea visible.
function injectRevealRuntime(html: string): string {
  const marker = 'data-lovable="reveal-runtime"';
  if (!html || html.includes(marker)) return html;

  // Solo inyectar si parece que existe un patrón tipo "reveal"
  const hayReveal = /\bclass=["'][^"']*\breveal\b/i.test(html) || /\.reveal\b/i.test(html);
  if (!hayReveal) return html;

  const runtime = `\n\n<script ${marker}>\n(() => {\n  const run = () => {\n    const els = Array.from(document.querySelectorAll('.reveal'));\n    if (!els.length) return;\n\n    // Failsafe: si el CSS los deja invisibles por defecto, los activamos al cargar\n    els.forEach((el) => el.classList.add('active'));\n\n    // Progressive enhancement: animar al entrar en viewport\n    try {\n      const io = new IntersectionObserver((entries) => {\n        for (const entry of entries) {\n          if (entry.isIntersecting) entry.target.classList.add('active');\n        }\n      }, { threshold: 0.1 });\n\n      els.forEach((el) => io.observe(el));\n    } catch {\n      // Si IntersectionObserver no está disponible, ya están visibles\n    }\n  };\n\n  if (document.readyState === 'loading') {\n    document.addEventListener('DOMContentLoaded', run, { once: true });\n  } else {\n    run();\n  }\n})();\n</script>\n`;

  const lower = html.toLowerCase();
  const idx = lower.lastIndexOf('</body>');
  if (idx !== -1) {
    return html.slice(0, idx) + runtime + html.slice(idx);
  }

  return html + runtime;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { business, systemPrompt: userPrompt } = (await req.json()) as {
      business: Business;
      systemPrompt?: string;
    };

    if (!business?.name) {
      return new Response(JSON.stringify({ error: "Missing business data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Generating website for:", business.name);
    console.log("MODEL: google/gemini-3-pro-preview");

    // Generar URLs de stock photos
    const stockImages = generateStockImageUrls(business);
    console.log("Image strategy: forced Picsum replacement");

    // Extraer código postal de la dirección
    const postalCode = business.address?.match(/\b\d{5}\b/)?.[0] || "No especificado";

    // System prompt base
    const baseSystemMessage =
      userPrompt ||
      `Eres un diseñador web de élite. Crea landing pages únicas, profesionales y memorables. Investiga qué tipo de diseño funciona mejor para cada tipo de negocio. Sé creativo, sorprendente y original. Cada diseño debe ser completamente diferente al anterior.`;

    // Solo añadir instrucciones mínimas de imágenes al prompt del usuario
    const systemMessage = `${baseSystemMessage}

IMÁGENES (OBLIGATORIO usar estos placeholders exactos):
- Hero: <img src="__HERO_IMAGE_URL__" alt="..." loading="lazy">
- Galería: <img src="__GALLERY_IMAGE_1__" alt="..."> y <img src="__GALLERY_IMAGE_2__" alt="...">
- Las fotos reales se inyectan automáticamente después.

Devuelve SOLO código HTML completo (con <!DOCTYPE html>), sin markdown ni explicaciones. Contenido en español.`;

    // User prompt = datos del negocio
    const userMessage = `Negocio: ${business.name}
Categoría: ${business.category || "No especificada"}
Dirección: ${business.address || "No especificada"}
Teléfono: ${business.phone || "No especificado"}
Código postal: ${postalCode}`;

    const MAX_RETRIES = 2;
    let html = "";
    let attempts = 0;

    while (attempts < MAX_RETRIES) {
      attempts++;
      console.log(`Attempt ${attempts} of ${MAX_RETRIES}`);

      // Añadir timeout al fetch principal
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

      try {
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-pro-preview",
            temperature: 0.8,
            max_tokens: 16000,
            messages: [
              { role: "system", content: systemMessage },
              { role: "user", content: userMessage },
            ],
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.error("AI gateway error:", response.status, errorText);

          if (response.status === 429) {
            return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
              status: 429,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (response.status === 402) {
            return new Response(JSON.stringify({ error: "Insufficient credits. Please add funds to continue." }), {
              status: 402,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          return new Response(JSON.stringify({ error: "AI gateway error" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const data = await response.json();
        const rawContent = data.choices?.[0]?.message?.content || "";
        html = cleanHtml(rawContent);

        // Forzar reemplazo de TODAS las imágenes por Picsum
        html = forceReplaceImages(html, stockImages);

        // Failsafe: asegurar que el contenido no quede invisible por animaciones rotas
        html = injectRevealRuntime(html);

        // Check if HTML is complete
        if (html.length >= 500 && isHtmlComplete(html)) {
          console.log(`HTML complete on attempt ${attempts}. Length: ${html.length}`);
          break;
        }

        console.warn(
          `Attempt ${attempts}: HTML incomplete or too short. Length: ${html.length}, Complete: ${isHtmlComplete(html)}`,
        );

        if (attempts >= MAX_RETRIES) {
          // If we've exhausted retries and HTML is still incomplete, try to fix it
          if (!isHtmlComplete(html) && html.length > 500) {
            console.log("Attempting to fix incomplete HTML...");
            if (!html.toLowerCase().includes("</style>")) html += "\n</style>";
            if (!html.toLowerCase().includes("</head>")) html += "\n</head>";
            if (!html.toLowerCase().includes("<body")) html += "\n<body>";
            if (!html.toLowerCase().includes("</body>")) html += "\n</body>";
            if (!html.toLowerCase().includes("</html>")) html += "\n</html>";
          }
        }
      } catch (e) {
        clearTimeout(timeoutId);
        if (e instanceof Error && e.name === 'AbortError') {
          console.error("Main LLM request timed out");
          if (attempts >= MAX_RETRIES) {
            return new Response(JSON.stringify({ error: "Request timed out. Please try again." }), {
              status: 504,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } else {
          throw e;
        }
      }
    }

    if (!html || html.length < 500) {
      console.error("Generated HTML too short:", html.length);
      return new Response(JSON.stringify({ error: "Failed to generate valid HTML" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Website generated successfully. HTML length:", html.length);

    return new Response(
      JSON.stringify({
        success: true,
        html,
        businessName: business.name,
        generatedAt: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error generating website:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
