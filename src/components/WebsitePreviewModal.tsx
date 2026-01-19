import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, ExternalLink, Smartphone, Monitor, Tablet, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

interface WebsitePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  html: string;
  businessName: string;
  onDownload: () => void;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

type ViewMode = 'desktop' | 'tablet' | 'mobile';

export const WebsitePreviewModal = ({
  isOpen,
  onClose,
  html,
  businessName,
  onDownload,
  onRegenerate,
  isRegenerating = false,
}: WebsitePreviewModalProps) => {
  const [viewMode, setViewMode] = useState<ViewMode>('desktop');

  const viewModeStyles: Record<ViewMode, string> = {
    desktop: 'w-full h-full',
    tablet: 'w-[768px] h-full mx-auto',
    mobile: 'w-[375px] h-full mx-auto',
  };

  // Use a Blob URL instead of srcDoc for more reliable rendering across browsers.
  const previewUrl = useMemo(() => {
    if (!html?.trim()) return null;
    const blob = new Blob([html], { type: 'text/html' });
    return URL.createObjectURL(blob);
  }, [html]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleOpenInNewTab = () => {
    if (!previewUrl) return;
    window.open(previewUrl, '_blank', 'noopener,noreferrer');
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
            className="w-full h-full max-w-7xl max-h-[90vh] bg-background rounded-xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/50">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-semibold text-foreground">
                  Preview: {businessName}
                </h2>
                
                {/* View Mode Toggle */}
                <div className="flex items-center gap-1 bg-background rounded-lg p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-8 w-8 p-0',
                      viewMode === 'desktop' && 'bg-primary text-primary-foreground'
                    )}
                    onClick={() => setViewMode('desktop')}
                  >
                    <Monitor className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-8 w-8 p-0',
                      viewMode === 'tablet' && 'bg-primary text-primary-foreground'
                    )}
                    onClick={() => setViewMode('tablet')}
                  >
                    <Tablet className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-8 w-8 p-0',
                      viewMode === 'mobile' && 'bg-primary text-primary-foreground'
                    )}
                    onClick={() => setViewMode('mobile')}
                  >
                    <Smartphone className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {onRegenerate && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={onRegenerate}
                    disabled={isRegenerating}
                  >
                    <RefreshCw className={cn("w-4 h-4 mr-2", isRegenerating && "animate-spin")} />
                    {isRegenerating ? 'Regenerando...' : 'Regenerar'}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleOpenInNewTab}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Abrir en nueva pestaña
                </Button>
                <Button variant="hot" size="sm" onClick={onDownload}>
                  <Download className="w-4 h-4 mr-2" />
                  Descargar ZIP
                </Button>
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Preview Area */}
            <div className="flex-1 bg-muted/30 p-4 overflow-hidden">
              <div className={cn(
                'h-full transition-all duration-300 bg-white rounded-lg shadow-2xl overflow-hidden',
                viewModeStyles[viewMode]
              )}>
                <iframe
                  src={previewUrl || undefined}
                  className="w-full h-full border-0"
                  title={`Preview de ${businessName}`}
                  sandbox="allow-scripts"
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
