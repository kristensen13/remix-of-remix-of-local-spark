import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sidebar } from '@/components/Sidebar';
import { WebsitePreviewModal } from '@/components/WebsitePreviewModal';
import { getStoredWebsites, deleteWebsite, StoredWebsite } from '@/lib/stores/websiteStore';
import { downloadWebsiteAsZip } from '@/lib/api/websites';
import { toast } from 'sonner';
import { Globe, Search, Download, Eye, Trash2, Calendar, MapPin, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const CreatedWebsites = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [websites, setWebsites] = useState<StoredWebsite[]>([]);
  const [previewWebsite, setPreviewWebsite] = useState<StoredWebsite | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load websites from database on mount
  useEffect(() => {
    loadWebsites();
  }, []);

  const loadWebsites = async () => {
    setIsLoading(true);
    const data = await getStoredWebsites();
    setWebsites(data);
    setIsLoading(false);
  };

  const filteredWebsites = websites.filter((w) =>
    w.businessName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handlePreview = (website: StoredWebsite) => {
    setPreviewWebsite(website);
  };

  const handleDownload = async (website: StoredWebsite) => {
    const success = await downloadWebsiteAsZip(website);
    if (success) {
      toast.success(`Descargando ${website.businessName}.zip...`);
    } else {
      toast.error('Error al descargar el ZIP');
    }
  };

  const handleDelete = async (website: StoredWebsite) => {
    const success = await deleteWebsite(website.id);
    if (success) {
      await loadWebsites();
      toast.success(`Web de ${website.businessName} eliminada`);
    } else {
      toast.error('Error al eliminar la web');
    }
  };

  const handleDownloadAll = async () => {
    let successCount = 0;
    for (const website of filteredWebsites) {
      const success = await downloadWebsiteAsZip(website);
      if (success) successCount++;
    }
    if (successCount > 0) {
      toast.success(`Descargadas ${successCount} webs`);
    } else {
      toast.error('Error al descargar las webs');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      
      <main className="ml-20 lg:ml-64 p-4 lg:p-6">
        {/* Header */}
        <motion.header
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="glass-card p-6 mb-6"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-cyan-400 flex items-center justify-center shadow-lg shadow-primary/30">
                <Globe className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Webs Creadas</h1>
                <p className="text-muted-foreground">
                  {websites.length} landing pages generadas
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="relative flex-1 lg:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Buscar por nombre..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-secondary border-0"
                />
              </div>
              <Button 
                variant="hot" 
                onClick={handleDownloadAll}
                disabled={filteredWebsites.length === 0}
              >
                <Download className="w-4 h-4 mr-2" />
                Descargar Todo
              </Button>
            </div>
          </div>
        </motion.header>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
        >
          <div className="glass-card p-4">
            <p className="text-sm text-muted-foreground">Total Webs</p>
            <p className="text-2xl font-bold text-foreground">{websites.length}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-sm text-muted-foreground">Filtradas</p>
            <p className="text-2xl font-bold text-primary">{filteredWebsites.length}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-sm text-muted-foreground">Categorías</p>
            <p className="text-2xl font-bold text-accent">
              {new Set(websites.map((w) => w.category)).size}
            </p>
          </div>
          <div className="glass-card p-4">
            <p className="text-sm text-muted-foreground">Última creada</p>
            <p className="text-lg font-bold text-foreground truncate">
              {websites[0]?.businessName || '-'}
            </p>
          </div>
        </motion.div>

        {/* Loading State */}
        {isLoading ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-card p-12 text-center"
          >
            <Loader2 className="w-16 h-16 text-primary mx-auto mb-4 animate-spin" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Cargando webs...
            </h3>
          </motion.div>
        ) : filteredWebsites.length > 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          >
            {filteredWebsites.map((website, index) => (
              <motion.div
                key={website.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="glass-card rounded-xl overflow-hidden group"
              >
                {/* Preview Thumbnail */}
                <div 
                  className="h-40 bg-gradient-to-br from-primary/20 to-accent/20 relative cursor-pointer"
                  onClick={() => handlePreview(website)}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Globe className="w-12 h-12 text-primary/40" />
                  </div>
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Eye className="w-8 h-8 text-white" />
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="font-semibold text-foreground truncate mb-1">
                    {website.businessName}
                  </h3>
                  <Badge variant="secondary" className="mb-2">
                    {website.category}
                  </Badge>
                  
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <MapPin className="w-3 h-3" />
                    <span className="truncate">{website.address}</span>
                  </div>
                  
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
                    <Calendar className="w-3 h-3" />
                    <span>{formatDate(website.generatedAt)}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => handlePreview(website)}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      Ver
                    </Button>
                    <Button 
                      variant="hot" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => handleDownload(website)}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      ZIP
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(website)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-card p-12 text-center"
          >
            <Globe className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              No hay webs creadas
            </h3>
            <p className="text-muted-foreground">
              Busca negocios sin web y crea landing pages profesionales para ellos.
            </p>
          </motion.div>
        )}
      </main>

      {/* Preview Modal */}
      {previewWebsite && (
        <WebsitePreviewModal
          isOpen={!!previewWebsite}
          onClose={() => setPreviewWebsite(null)}
          html={previewWebsite.html}
          businessName={previewWebsite.businessName}
          onDownload={() => handleDownload(previewWebsite)}
        />
      )}
    </div>
  );
};

export default CreatedWebsites;
