import { motion } from 'framer-motion';
import { Business } from '@/data/mockData';
import { cn } from '@/lib/utils';
import { Star, MapPin, Flame } from 'lucide-react';
import { getCategoryIcon } from '@/lib/categoryIcons';

interface BusinessListProps {
  businesses: Business[];
  selectedBusiness: Business | null;
  onBusinessSelect: (business: Business) => void;
}

const getStatusStyles = (business: Business) => {
  // Confirmed no website = hot opportunity
  if (business.hasWebsite === false) {
    return {
      border: 'border-l-orange-500 bg-orange-500/5',
      scoreColor: 'text-orange-500',
      isHot: true,
    };
  }
  // Has website = cold
  if (business.hasWebsite === true) {
    return {
      border: 'border-l-gray-500 bg-gray-500/5',
      scoreColor: 'text-gray-400',
      isHot: false,
    };
  }
  // Unknown (pending verification) - use temperature-based colors
  const temperatureColors = {
    hot: { border: 'border-l-primary bg-primary/5', scoreColor: 'text-primary' },
    warm: { border: 'border-l-accent bg-accent/5', scoreColor: 'text-accent' },
    cool: { border: 'border-l-blue-500 bg-blue-500/5', scoreColor: 'text-blue-400' },
    cold: { border: 'border-l-gray-500 bg-gray-500/5', scoreColor: 'text-gray-400' },
  };
  return {
    ...temperatureColors[business.temperature],
    isHot: false,
  };
};

export const BusinessList = ({
  businesses,
  selectedBusiness,
  onBusinessSelect,
}: BusinessListProps) => {
  return (
    <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-280px)] pr-2">
      {businesses.map((business, index) => {
        const CategoryIcon = getCategoryIcon(business.category);
        const statusStyles = getStatusStyles(business);
        
        return (
          <motion.div
            key={business.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => onBusinessSelect(business)}
            className={cn(
              'p-4 rounded-xl border-l-4 cursor-pointer transition-all duration-200',
              statusStyles.border,
              selectedBusiness?.id === business.id
                ? 'ring-2 ring-primary bg-primary/10'
                : 'hover:bg-secondary/50'
            )}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <CategoryIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <h3 className="font-semibold text-foreground truncate">{business.name}</h3>
                  {statusStyles.isHot && (
                    <Flame className="w-4 h-4 text-orange-500 flex-shrink-0" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{business.category}</p>
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <MapPin className="w-3 h-3" />
                  <span className="truncate">{business.address}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1">
                  {statusStyles.isHot && (
                    <span className="text-orange-500 text-sm">🔥</span>
                  )}
                  <span className={cn('text-lg font-bold', statusStyles.scoreColor)}>
                    {business.score}%
                  </span>
                </div>
                {business.rating && (
                  <div className="flex items-center gap-1 text-xs">
                    <Star className="w-3 h-3 text-accent fill-accent" />
                    <span>{business.rating}</span>
                  </div>
                )}
                {/* Status badge */}
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-full',
                  business.hasWebsite === false 
                    ? 'bg-orange-500/20 text-orange-400'
                    : business.hasWebsite === true
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-muted text-muted-foreground'
                )}>
                  {business.hasWebsite === false 
                    ? '¡Sin web!' 
                    : business.hasWebsite === true
                    ? 'Tiene web'
                    : 'Verificar'}
                </span>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};
