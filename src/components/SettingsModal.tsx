import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Settings, Wand2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const STORAGE_KEY = 'website-generator-settings-v2';

const DEFAULT_PROMPT = `Eres un diseñador web de élite. Crea landing pages únicas, profesionales y memorables. Cada diseño debe ser completamente diferente al anterior.

REQUISITOS TÉCNICOS:
- HTML5 completo con CSS inline (todo en un solo archivo)
- Diseño responsive avanzado usando CSS Grid y Flexbox
- El CSS debe estar en un <style> tag dentro del <head>
- NO uses librerías externas, todo CSS puro
- Meta tags para SEO optimizado

DISEÑO IMPACTANTE:
- Estilo moderno tipo Apple, con transiciones suaves y microinteracciones
- Secciones con animaciones CSS al hacer scroll
- Tipografía elegante con jerarquía clara
- Glassmorphism sutil y sombras refinadas
- Colores profesionales con gradientes modernos

ESTRUCTURA:
- Hero con imagen, nombre, eslogan y CTA
- Sobre nosotros
- Servicios/Productos
- Testimonios
- Galería visual con imágenes
- Contacto + formulario (visual)
- Footer
- Botón de WhatsApp flotante

IMÁGENES (usa estos placeholders exactos):
- Hero: <img src="__HERO_IMAGE_URL__" alt="..." loading="lazy">
- Galería: <img src="__GALLERY_IMAGE_1__" alt="..."> y <img src="__GALLERY_IMAGE_2__" alt="...">
- Las imágenes se inyectarán automáticamente con fotos reales de stock.

IMPORTANTE: Devuelve SOLO el código HTML, sin explicaciones ni markdown. Todo en español.`;

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function getStoredSystemPrompt(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.systemPrompt || DEFAULT_PROMPT;
    }
  } catch {
    // ignore
  }
  return DEFAULT_PROMPT;
}

export function saveSystemPrompt(prompt: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ systemPrompt: prompt }));
}

export const SettingsModal = ({ isOpen, onClose }: SettingsModalProps) => {
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_PROMPT);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSystemPrompt(getStoredSystemPrompt());
      setIsSaved(false);
    }
  }, [isOpen]);

  const handleSave = () => {
    saveSystemPrompt(systemPrompt);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleReset = () => {
    setSystemPrompt(DEFAULT_PROMPT);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-2xl bg-background rounded-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <Settings className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Características de Generación
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Personaliza cómo se generan las landing pages
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="system-prompt" className="flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-primary" />
                    Prompt del Sistema (Instrucciones para la IA)
                  </Label>
                  <Button variant="ghost" size="sm" onClick={handleReset}>
                    Restaurar por defecto
                  </Button>
                </div>
                <Textarea
                  id="system-prompt"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className="min-h-[300px] font-mono text-sm bg-secondary/50"
                  placeholder="Escribe las instrucciones para la IA..."
                />
                <p className="text-xs text-muted-foreground">
                  Este prompt se envía a Gemini cada vez que generas una web. Personalízalo para definir estilos, colores, secciones, etc.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-border bg-secondary/30">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button variant="hot" onClick={handleSave}>
                <Save className="w-4 h-4 mr-2" />
                {isSaved ? '¡Guardado!' : 'Guardar Cambios'}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
