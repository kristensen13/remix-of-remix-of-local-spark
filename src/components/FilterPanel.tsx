import { useState } from 'react';
import { motion } from 'framer-motion';
import { Filter, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface BusinessFilters {
  onlyWithoutWeb: boolean;
  categories: string[];
  minScore: number;
  temperatures: string[];
}

interface FilterPanelProps {
  filters: BusinessFilters;
  onFiltersChange: (filters: BusinessFilters) => void;
  availableCategories: string[];
  totalCount: number;
  filteredCount: number;
}

const temperatureOptions = [
  { id: 'hot', label: '🔥 Muy Alto', color: 'bg-primary/20 text-primary border-primary/30' },
  { id: 'warm', label: '🌡️ Alto', color: 'bg-accent/20 text-accent border-accent/30' },
  { id: 'cool', label: '❄️ Moderado', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { id: 'cold', label: '🧊 Bajo', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
];

export const FilterPanel = ({
  filters,
  onFiltersChange,
  availableCategories,
  totalCount,
  filteredCount,
}: FilterPanelProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleCategory = (category: string) => {
    const newCategories = filters.categories.includes(category)
      ? filters.categories.filter((c) => c !== category)
      : [...filters.categories, category];
    onFiltersChange({ ...filters, categories: newCategories });
  };

  const toggleTemperature = (temp: string) => {
    const newTemps = filters.temperatures.includes(temp)
      ? filters.temperatures.filter((t) => t !== temp)
      : [...filters.temperatures, temp];
    onFiltersChange({ ...filters, temperatures: newTemps });
  };

  const clearFilters = () => {
    onFiltersChange({
      onlyWithoutWeb: false,
      categories: [],
      minScore: 0,
      temperatures: ['hot', 'warm', 'cool', 'cold'],
    });
  };

  const hasActiveFilters =
    filters.onlyWithoutWeb ||
    filters.categories.length > 0 ||
    filters.minScore > 0 ||
    filters.temperatures.length < 4;

  return (
    <div className="glass-card rounded-xl overflow-hidden mb-4">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <Filter className="w-5 h-5 text-primary" />
          <span className="font-medium text-foreground">Filtros</span>
          {hasActiveFilters && (
            <Badge variant="secondary" className="bg-primary/20 text-primary">
              Activos
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {filteredCount} de {totalCount} negocios
          </span>
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <svg
              className="w-5 h-5 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </motion.div>
        </div>
      </div>

      {/* Expanded Content */}
      <motion.div
        initial={false}
        animate={{ height: isExpanded ? 'auto' : 0, opacity: isExpanded ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        className="overflow-hidden"
      >
        <div className="p-4 pt-0 space-y-6">
          {/* Sin Web Toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="only-without-web" className="text-sm font-medium">
              Solo negocios SIN página web
            </Label>
            <Switch
              id="only-without-web"
              checked={filters.onlyWithoutWeb}
              onCheckedChange={(checked) =>
                onFiltersChange({ ...filters, onlyWithoutWeb: checked })
              }
            />
          </div>

          {/* Temperature Filter */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Potencial del negocio</Label>
            <div className="flex flex-wrap gap-2">
              {temperatureOptions.map((temp) => (
                <Badge
                  key={temp.id}
                  variant="outline"
                  className={cn(
                    'cursor-pointer transition-all',
                    filters.temperatures.includes(temp.id)
                      ? temp.color
                      : 'opacity-40 hover:opacity-70'
                  )}
                  onClick={() => toggleTemperature(temp.id)}
                >
                  {filters.temperatures.includes(temp.id) && (
                    <Check className="w-3 h-3 mr-1" />
                  )}
                  {temp.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Min Score Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Puntuación mínima</Label>
              <span className="text-sm font-bold text-primary">{filters.minScore}%</span>
            </div>
            <Slider
              value={[filters.minScore]}
              onValueChange={([value]) =>
                onFiltersChange({ ...filters, minScore: value })
              }
              max={100}
              step={5}
              className="w-full"
            />
          </div>

          {/* Category Filter */}
          {availableCategories.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Categorías</Label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {availableCategories.map((category) => (
                  <Badge
                    key={category}
                    variant="outline"
                    className={cn(
                      'cursor-pointer transition-all',
                      filters.categories.includes(category)
                        ? 'bg-primary/20 text-primary border-primary/30'
                        : 'hover:bg-secondary'
                    )}
                    onClick={() => toggleCategory(category)}
                  >
                    {filters.categories.includes(category) && (
                      <Check className="w-3 h-3 mr-1" />
                    )}
                    {category}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters} className="w-full">
              <X className="w-4 h-4 mr-2" />
              Limpiar filtros
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
};
