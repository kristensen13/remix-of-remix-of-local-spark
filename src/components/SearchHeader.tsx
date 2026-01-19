import { motion } from 'framer-motion';
import { Search, Filter, MapPin, Building, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface SearchParams {
  postalCode: string;
  city: string;
  businessName: string;
  category: string;
}

interface SearchHeaderProps {
  searchParams: SearchParams;
  onSearchParamsChange: (params: SearchParams) => void;
  onSearch: () => void;
  activeFilters: string[];
  onFilterToggle: (filter: string) => void;
  isSearching: boolean;
}

const temperatureFilters = [
  { id: 'hot', label: '🔥 Caliente', color: 'bg-primary/20 text-primary border-primary/30' },
  { id: 'warm', label: '🌡️ Templado', color: 'bg-accent/20 text-accent border-accent/30' },
  { id: 'cool', label: '❄️ Frío', color: 'bg-cool/20 text-cool border-cool/30' },
  { id: 'cold', label: '🧊 Muy Frío', color: 'bg-cold/20 text-cold border-cold/30' },
];

export const SearchHeader = ({
  searchParams,
  onSearchParamsChange,
  onSearch,
  activeFilters,
  onFilterToggle,
  isSearching,
}: SearchHeaderProps) => {
  const updateParam = (key: keyof SearchParams, value: string) => {
    onSearchParamsChange({ ...searchParams, [key]: value });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSearch();
  };

  const hasSearchCriteria = searchParams.postalCode || searchParams.city || searchParams.businessName || searchParams.category;

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="glass-card p-4 lg:p-6 mb-6"
    >
      <div className="flex flex-col gap-4">
        {/* Main Search Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Postal Code */}
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Código postal..."
              value={searchParams.postalCode}
              onChange={(e) => updateParam('postalCode', e.target.value)}
              className="pl-10 h-11 bg-secondary border-0 focus:ring-2 focus:ring-primary"
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* City */}
          <div className="relative">
            <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Ciudad..."
              value={searchParams.city}
              onChange={(e) => updateParam('city', e.target.value)}
              className="pl-10 h-11 bg-secondary border-0 focus:ring-2 focus:ring-primary"
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Business Name */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Nombre del negocio..."
              value={searchParams.businessName}
              onChange={(e) => updateParam('businessName', e.target.value)}
              className="pl-10 h-11 bg-secondary border-0 focus:ring-2 focus:ring-primary"
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Category */}
          <div className="relative">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Categoría (ej: restaurante)..."
              value={searchParams.category}
              onChange={(e) => updateParam('category', e.target.value)}
              className="pl-10 h-11 bg-secondary border-0 focus:ring-2 focus:ring-primary"
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Search Button */}
          <Button
            variant="hot"
            size="lg"
            onClick={onSearch}
            disabled={isSearching || !hasSearchCriteria}
            className="h-11"
          >
            {isSearching ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full"
              />
            ) : (
              <>
                <Search className="w-5 h-5" />
                <span className="hidden sm:inline ml-2">Buscar</span>
              </>
            )}
          </Button>
        </div>

        {/* Temperature Filters */}
        <div className="flex gap-2 flex-wrap items-center">
          <Filter className="w-4 h-4 text-muted-foreground mr-1" />
          <span className="text-sm text-muted-foreground mr-2">Filtrar por temperatura:</span>
          {temperatureFilters.map((filter) => (
            <Badge
              key={filter.id}
              variant="outline"
              className={cn(
                'cursor-pointer transition-all duration-200 px-3 py-1.5 text-sm',
                activeFilters.includes(filter.id)
                  ? filter.color
                  : 'bg-secondary border-border text-muted-foreground hover:bg-secondary/80'
              )}
              onClick={() => onFilterToggle(filter.id)}
            >
              {filter.label}
            </Badge>
          ))}
        </div>
      </div>
    </motion.header>
  );
};
