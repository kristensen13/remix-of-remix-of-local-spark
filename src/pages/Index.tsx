import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from '@/components/Sidebar';
import { SearchHeader, SearchParams } from '@/components/SearchHeader';
import { BusinessCard } from '@/components/BusinessCard';
import { BusinessList } from '@/components/BusinessList';
import { BusinessMap } from '@/components/BusinessMap';
import { WebsitePreviewModal } from '@/components/WebsitePreviewModal';
import { SettingsModal } from '@/components/SettingsModal';
import { FilterPanel, BusinessFilters } from '@/components/FilterPanel';
import { Business } from '@/data/mockData';
import { searchBusinesses } from '@/lib/api/businesses';
import { generateWebsite, downloadWebsiteAsZip, GeneratedWebsite } from '@/lib/api/websites';
import { saveWebsite, StoredWebsite } from '@/lib/stores/websiteStore';
import { toast } from 'sonner';
import { List, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Index = () => {
  const [searchParams, setSearchParams] = useState<SearchParams>({
    postalCode: '',
    city: '',
    businessName: '',
    category: '',
  });
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreatingWeb, setIsCreatingWeb] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [mapCenter, setMapCenter] = useState<[number, number]>([40.4168, -3.7038]);
  const [currentBusiness, setCurrentBusiness] = useState<Business | null>(null);
  
  // Modal states
  const [previewWebsite, setPreviewWebsite] = useState<GeneratedWebsite | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Filters
  const [filters, setFilters] = useState<BusinessFilters>({
    onlyWithoutWeb: false,
    categories: [],
    minScore: 0,
    temperatures: ['hot', 'warm', 'cool', 'cold'],
  });

  // Get available categories from businesses
  const availableCategories = useMemo(() => {
    const categories = new Set(businesses.map((b) => b.category));
    return Array.from(categories).sort();
  }, [businesses]);

  // Apply filters
  const filteredBusinesses = useMemo(() => {
    return businesses.filter((b) => {
      // Temperature filter
      if (!filters.temperatures.includes(b.temperature)) return false;
      
      // Only without web filter
      if (filters.onlyWithoutWeb && b.hasWebsite) return false;
      
      // Category filter
      if (filters.categories.length > 0 && !filters.categories.includes(b.category)) return false;
      
      // Min score filter
      if (b.score < filters.minScore) return false;
      
      return true;
    });
  }, [businesses, filters]);

  const handleSearch = async () => {
    const hasSearchCriteria = searchParams.postalCode || searchParams.city || searchParams.businessName || searchParams.category;
    if (!hasSearchCriteria) return;
    
    setIsSearching(true);
    setSelectedBusiness(null);
    
    try {
      const result = await searchBusinesses(searchParams);
      
      if (result.success && result.businesses) {
        setBusinesses(result.businesses);
        if (result.center) {
          setMapCenter([result.center.lat, result.center.lng]);
        }
        const withoutWeb = result.businesses.filter(b => b.hasWebsite === false).length;
        const unknownWeb = result.businesses.filter(b => b.hasWebsite === null).length;
        const locationInfo = searchParams.city || searchParams.postalCode || 'la zona';
        toast.success(`Encontrados ${result.businesses.length} negocios en ${locationInfo}`, {
          description: unknownWeb > 0 ? `Haz clic en cada negocio para ver detalles y teléfono` : `${withoutWeb} sin web`,
        });
      } else {
        toast.error(result.error || 'Error buscando negocios');
        setBusinesses([]);
      }
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Error conectando con el servidor');
      setBusinesses([]);
    }
    
    setIsSearching(false);
  };

  const handleCreateWeb = async (business: Business) => {
    setIsCreatingWeb(true);
    setCurrentBusiness(business);
    
    try {
      const result = await generateWebsite(business);
      
      if (result.success && result.website) {
        // Save to database
        const storedWebsite: StoredWebsite = {
          ...result.website,
          category: business.category,
          address: business.address,
          phone: business.phone,
        };
        
        console.log('Attempting to save website:', storedWebsite);
        const saved = await saveWebsite(storedWebsite);
        
        if (saved) {
          toast.success(`¡Web creada para ${business.name}!`, {
            description: `Variante: ${result.website.variant || 'default'}. Guardada en la base de datos.`,
          });
        } else {
          toast.warning(`Web creada pero no se pudo guardar`, {
            description: 'Puedes descargarla manualmente',
          });
        }
        
        // Show preview modal
        setPreviewWebsite(result.website);
      } else {
        toast.error('Error creando la web', {
          description: result.error || 'Intenta de nuevo',
        });
      }
    } catch (error) {
      console.error('Error creating web:', error);
      toast.error('Error creando la web');
    }
    
    setIsCreatingWeb(false);
  };

  const handleRegenerate = async () => {
    if (!currentBusiness) return;
    
    setIsRegenerating(true);
    
    try {
      const result = await generateWebsite(currentBusiness);
      
      if (result.success && result.website) {
        // Save to database
        const storedWebsite: StoredWebsite = {
          ...result.website,
          category: currentBusiness.category,
          address: currentBusiness.address,
          phone: currentBusiness.phone,
        };
        
        const saved = await saveWebsite(storedWebsite);
        
        if (saved) {
          toast.success(`¡Web regenerada!`, {
            description: `Nueva variante: ${result.website.variant || 'default'}`,
          });
        }
        
        // Update preview
        setPreviewWebsite(result.website);
      } else {
        toast.error('Error regenerando la web', {
          description: result.error || 'Intenta de nuevo',
        });
      }
    } catch (error) {
      console.error('Error regenerating web:', error);
      toast.error('Error regenerando la web');
    }
    
    setIsRegenerating(false);
  };

  const handleDownloadFromPreview = async () => {
    if (previewWebsite) {
      const success = await downloadWebsiteAsZip(previewWebsite);
      if (success) {
        toast.success('¡Descarga completada!');
      } else {
        toast.error('Error al descargar el ZIP');
      }
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      
      <main className="ml-20 lg:ml-64 p-4 lg:p-6">
        {/* Header with Settings Button */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1">
            <SearchHeader
              searchParams={searchParams}
              onSearchParamsChange={setSearchParams}
              onSearch={handleSearch}
              activeFilters={filters.temperatures}
              onFilterToggle={(temp) => {
                setFilters(prev => ({
                  ...prev,
                  temperatures: prev.temperatures.includes(temp)
                    ? prev.temperatures.filter(t => t !== temp)
                    : [...prev.temperatures, temp]
                }));
              }}
              isSearching={isSearching}
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsSettingsOpen(true)}
            className="h-12 w-12 shrink-0"
          >
            <Settings className="w-5 h-5" />
          </Button>
        </div>

        {/* Filter Panel */}
        {businesses.length > 0 && (
          <FilterPanel
            filters={filters}
            onFiltersChange={setFilters}
            availableCategories={availableCategories}
            totalCount={businesses.length}
            filteredCount={filteredBusinesses.length}
          />
        )}

        {/* Stats Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6"
        >
          <div className="glass-card p-4 rounded-xl">
            <p className="text-sm text-muted-foreground">Total Negocios</p>
            <p className="text-2xl font-bold text-foreground">{businesses.length}</p>
          </div>
          <div className="glass-card p-4 rounded-xl">
            <p className="text-sm text-muted-foreground">Filtrados</p>
            <p className="text-2xl font-bold text-primary">{filteredBusinesses.length}</p>
          </div>
          <div className="glass-card p-4 rounded-xl">
            <p className="text-sm text-muted-foreground">🔥 Calientes</p>
            <p className="text-2xl font-bold text-primary">
              {filteredBusinesses.filter((b) => b.temperature === 'hot').length}
            </p>
          </div>
          <div className="glass-card p-4 rounded-xl">
            <p className="text-sm text-muted-foreground">Sin Web</p>
            <p className="text-2xl font-bold text-accent">
              {businesses.filter((b) => b.hasWebsite === false).length}
              {businesses.some(b => b.hasWebsite === null) && (
                <span className="text-sm text-muted-foreground ml-1">
                  (+{businesses.filter(b => b.hasWebsite === null).length} ?)
                </span>
              )}
            </p>
          </div>
          <div className="glass-card p-4 rounded-xl">
            <p className="text-sm text-muted-foreground">Búsqueda</p>
            <p className="text-lg font-bold text-foreground truncate">
              {searchParams.city || searchParams.postalCode || '-'}
            </p>
          </div>
        </motion.div>

        {/* Business Grid */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Map */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 glass-card rounded-xl h-[500px] overflow-hidden"
          >
            <BusinessMap
              businesses={filteredBusinesses}
              selectedBusiness={selectedBusiness}
              onBusinessSelect={setSelectedBusiness}
              center={mapCenter}
            />
          </motion.div>

          {/* Business List */}
          <div className="w-full lg:w-96">
            <div className="glass-card p-4 h-[500px] rounded-xl">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <List className="w-4 h-4" />
                Negocios ({filteredBusinesses.length})
              </h3>
              <BusinessList
                businesses={filteredBusinesses}
                selectedBusiness={selectedBusiness}
                onBusinessSelect={setSelectedBusiness}
              />
            </div>
          </div>

          {/* Business Detail Card */}
          <AnimatePresence>
            {selectedBusiness && (
              <div className="fixed right-4 lg:right-8 top-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
                <BusinessCard
                  business={selectedBusiness}
                  onClose={() => setSelectedBusiness(null)}
                  onCreateWeb={handleCreateWeb}
                  isCreatingWeb={isCreatingWeb}
                  onBusinessUpdate={(updatedBusiness) => {
                    // Update in the businesses list
                    setBusinesses(prev => 
                      prev.map(b => b.id === updatedBusiness.id ? updatedBusiness : b)
                    );
                    // Update selected business too
                    setSelectedBusiness(updatedBusiness);
                  }}
                />
              </div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Website Preview Modal */}
      <WebsitePreviewModal
        isOpen={!!previewWebsite}
        onClose={() => setPreviewWebsite(null)}
        html={previewWebsite?.html || ''}
        businessName={previewWebsite?.businessName || ''}
        onDownload={handleDownloadFromPreview}
        onRegenerate={handleRegenerate}
        isRegenerating={isRegenerating}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};

export default Index;
