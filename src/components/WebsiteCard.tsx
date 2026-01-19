import { motion } from 'framer-motion';
import { Globe, Download, ExternalLink, Calendar, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreatedWebsite } from '@/data/mockData';

interface WebsiteCardProps {
  website: CreatedWebsite;
  onPreview: (website: CreatedWebsite) => void;
  onDownload: (website: CreatedWebsite) => void;
}

export const WebsiteCard = ({ website, onPreview, onDownload }: WebsiteCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -4 }}
      className="glass-card overflow-hidden group"
    >
      {/* Preview Thumbnail */}
      <div className="relative h-48 bg-gradient-to-br from-secondary to-muted overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <Globe className="w-16 h-16 text-muted-foreground/30" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
        
        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-primary/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3">
          <Button
            variant="glass"
            size="sm"
            onClick={() => onPreview(website)}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Preview
          </Button>
          <Button
            variant="glass"
            size="sm"
            onClick={() => onDownload(website)}
          >
            <Download className="w-4 h-4 mr-2" />
            ZIP
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        <h3 className="font-bold text-lg text-foreground mb-1 truncate">
          {website.businessName}
        </h3>
        
        <div className="flex items-center gap-2 mb-4">
          <Badge variant="outline" className="text-xs">
            <Tag className="w-3 h-3 mr-1" />
            {website.category}
          </Badge>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {new Date(website.createdAt).toLocaleDateString('es-ES')}
          </span>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onPreview(website)}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Ver Preview
          </Button>
          <Button
            variant="default"
            size="sm"
            className="flex-1"
            onClick={() => onDownload(website)}
          >
            <Download className="w-4 h-4 mr-2" />
            Descargar
          </Button>
        </div>
      </div>
    </motion.div>
  );
};
