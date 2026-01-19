import { motion, AnimatePresence } from 'framer-motion';
import { X, Phone, MapPin, Clock, Star, Globe, Zap, ExternalLink, Loader2, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Business } from '@/data/mockData';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { getBusinessDetails, BusinessDetails } from '@/lib/api/businessDetails';
import { getCategoryIcon } from '@/lib/categoryIcons';

interface BusinessCardProps {
  business: Business;
  onClose: () => void;
  onCreateWeb: (business: Business) => void;
  isCreatingWeb: boolean;
  onBusinessUpdate?: (updatedBusiness: Business) => void;
}

// Get status label and styles based on website verification
function getStatusInfo(hasWebsite: boolean | null, temperature: 'hot' | 'warm' | 'cool' | 'cold') {
  // Confirmed no website = hot opportunity with fire
  if (hasWebsite === false) {
    return {
      badge: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      glow: 'shadow-lg shadow-orange-500/20',
      gradient: 'from-orange-500 to-red-500',
      label: '🔥 Oportunidad Confirmada',
      isHot: true,
    };
  }
  
  // Has website = low priority
  if (hasWebsite === true) {
    return {
      badge: 'bg-green-500/20 text-green-400 border-green-500/30',
      glow: '',
      gradient: 'from-green-500 to-green-400',
      label: '✓ Ya tiene web',
      isHot: false,
    };
  }
  
  // Unknown - pending verification, use temperature-based styles
  const temperatureStyles = {
    hot: {
      badge: 'bg-primary/20 text-primary border-primary/30',
      glow: 'shadow-lg shadow-primary/20',
      gradient: 'from-primary to-cyan-400',
      label: 'Alto Potencial',
    },
    warm: {
      badge: 'bg-accent/20 text-accent border-accent/30',
      glow: 'shadow-lg shadow-accent/20',
      gradient: 'from-accent to-orange-400',
      label: 'Potencial Medio',
    },
    cool: {
      badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      glow: '',
      gradient: 'from-blue-500 to-blue-400',
      label: 'Potencial Moderado',
    },
    cold: {
      badge: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
      glow: '',
      gradient: 'from-gray-500 to-gray-400',
      label: 'Bajo Potencial',
    },
  };
  
  return {
    ...temperatureStyles[temperature],
    isHot: false,
  };
}

// Recalculate temperature based on actual hasWebsite value
function recalculateTemperature(hasWebsite: boolean, category: string): { temperature: 'hot' | 'warm' | 'cool' | 'cold'; score: number; reason: string } {
  if (hasWebsite) {
    return { temperature: 'cold', score: 10, reason: 'Ya tiene presencia web.' };
  }
  
  const hotCategories = ['shoe', 'zapater', 'hardware', 'ferreter', 'optician', 'óptica', 'optica', 'jewelry', 'joyer', 'watch', 'relojer', 'gym', 'gimnasio', 'clinic', 'clínica', 'clinica', 'dental', 'dentist', 'instrument', 'sport', 'deporte', 'electronics', 'electrónica', 'electronica', 'computer', 'informática', 'informatica', 'plumber', 'fontaner', 'electrician', 'electric', 'reform', 'construcción', 'construccion', 'mechanic', 'taller', 'auto', 'car repair'];
  const warmCategories = ['florist', 'florister', 'book', 'librer', 'fashion', 'moda', 'boutique', 'hair', 'peluquer', 'beauty', 'estética', 'estetica', 'restaurant', 'restaurante', 'cafe', 'cafeter', 'bar', 'brewery', 'cervecer', 'grill', 'asador', 'pizza', 'tapas', 'bakery', 'pasteler'];
  const coolCategories = ['bakery', 'panader', 'fruit', 'fruter', 'butcher', 'carnicer', 'fish', 'pescader', 'haberdashery', 'mercer', 'delicatessen', 'charcuter', 'grocery', 'alimentación', 'alimentacion', 'supermarket'];
  
  const lowerCategory = category.toLowerCase();
  
  if (hotCategories.some(c => lowerCategory.includes(c))) {
    return { 
      temperature: 'hot', 
      score: 85 + Math.floor(Math.random() * 15), 
      reason: `Alto potencial: Catálogo online, reservas, venta e-commerce, fidelización.` 
    };
  }
  
  if (warmCategories.some(c => lowerCategory.includes(c))) {
    return { 
      temperature: 'warm', 
      score: 60 + Math.floor(Math.random() * 20), 
      reason: `Potencial medio: Reservas online, galería de trabajos, menú digital.` 
    };
  }
  
  if (coolCategories.some(c => lowerCategory.includes(c))) {
    return { 
      temperature: 'cool', 
      score: 30 + Math.floor(Math.random() * 25), 
      reason: `Potencial moderado: Web informativa, horarios, pedidos online.` 
    };
  }
  
  return { 
    temperature: 'warm', 
    score: 50 + Math.floor(Math.random() * 30), 
    reason: `Potencial por evaluar: Presencia digital básica recomendada.` 
  };
}

export const BusinessCard = ({
  business,
  onClose,
  onCreateWeb,
  isCreatingWeb,
  onBusinessUpdate,
}: BusinessCardProps) => {
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [localBusiness, setLocalBusiness] = useState(business);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const CategoryIcon = getCategoryIcon(localBusiness.category);

  // Load details on demand when card opens
  useEffect(() => {
    const loadDetails = async () => {
      // Only load if we need details (needsDetails flag is true)
      if (!localBusiness.needsDetails) return;
      
      setLoadingDetails(true);
      setDetailsError(null);
      
      try {
        const details = await getBusinessDetails(localBusiness.id);
        
        // Recalculate temperature based on actual hasWebsite
        const { temperature, score, reason } = recalculateTemperature(details.hasWebsite, localBusiness.category);
        
        const updatedBusiness: Business = {
          ...localBusiness,
          phone: details.phone,
          website: details.website || undefined,
          hasWebsite: details.hasWebsite,
          rating: details.rating,
          reviewCount: details.reviewCount,
          postalCode: details.postalCode || localBusiness.postalCode,
          address: details.fullAddress || localBusiness.address,
          temperature,
          score,
          potentialReason: reason,
          needsDetails: false, // Mark as loaded
        };
        
        setLocalBusiness(updatedBusiness);
        
        // Notify parent to update the business in the list
        if (onBusinessUpdate) {
          onBusinessUpdate(updatedBusiness);
        }
      } catch (error) {
        console.error('Error loading business details:', error);
        setDetailsError('Error al cargar detalles');
      } finally {
        setLoadingDetails(false);
      }
    };
    
    loadDetails();
  }, [business.id]); // Only run when business.id changes

  const statusInfo = getStatusInfo(localBusiness.hasWebsite, localBusiness.temperature);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: 100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 100, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={cn(
          'glass-card p-6 w-full max-w-md overflow-hidden',
          statusInfo.glow
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {/* Category Icon */}
              <div className={cn(
                'p-2 rounded-lg',
                statusInfo.isHot ? 'bg-orange-500/20' : 'bg-secondary'
              )}>
                <CategoryIcon className={cn(
                  'w-5 h-5',
                  statusInfo.isHot ? 'text-orange-400' : 'text-muted-foreground'
                )} />
              </div>
              {loadingDetails ? (
                <Skeleton className="h-5 w-32" />
              ) : (
                <Badge variant="outline" className={cn(statusInfo.badge)}>
                  {statusInfo.isHot && <Flame className="w-3 h-3 mr-1" />}
                  {statusInfo.label}
                </Badge>
              )}
              {localBusiness.postalCodeMatch === false && localBusiness.searchedPostalCode && (
                <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                  📍 CP: {localBusiness.postalCode || 'N/A'}
                </Badge>
              )}
            </div>
            <h2 className="text-xl font-bold text-foreground">{localBusiness.name}</h2>
            <p className="text-muted-foreground">{localBusiness.category}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Score */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Puntuación de potencial</span>
            {loadingDetails ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="flex items-center gap-2">
                {statusInfo.isHot && <span className="text-xl">🔥</span>}
                <span className={cn('text-2xl font-bold bg-gradient-to-r bg-clip-text text-transparent', statusInfo.gradient)}>
                  {localBusiness.score}%
                </span>
              </div>
            )}
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            {loadingDetails ? (
              <Skeleton className="h-full w-1/2" />
            ) : (
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${localBusiness.score}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className={cn('h-full rounded-full bg-gradient-to-r', statusInfo.gradient)}
              />
            )}
          </div>
        </div>

        {/* Info Grid */}
        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-3 text-sm">
            <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-foreground">{localBusiness.address}</span>
          </div>
          
          {/* Phone - show skeleton while loading */}
          <div className="flex items-center gap-3 text-sm">
            <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            {loadingDetails ? (
              <Skeleton className="h-4 w-32" />
            ) : localBusiness.phone ? (
              <a href={`tel:${localBusiness.phone}`} className="text-primary hover:underline">
                {localBusiness.phone}
              </a>
            ) : (
              <span className="text-muted-foreground italic">Sin teléfono disponible</span>
            )}
          </div>
          
          {localBusiness.openingHours && (
            <div className="flex items-center gap-3 text-sm">
              <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-foreground">{localBusiness.openingHours}</span>
            </div>
          )}
          
          {/* Rating - show skeleton while loading */}
          <div className="flex items-center gap-3 text-sm">
            <Star className="w-4 h-4 text-accent flex-shrink-0" />
            {loadingDetails ? (
              <Skeleton className="h-4 w-24" />
            ) : localBusiness.rating ? (
              <span className="text-foreground">
                {localBusiness.rating} ({localBusiness.reviewCount} reseñas)
              </span>
            ) : (
              <span className="text-muted-foreground italic">Sin valoraciones</span>
            )}
          </div>
          
          {/* Website status - show skeleton while loading */}
          <div className="flex items-center gap-3 text-sm">
            {loadingDetails ? (
              <>
                <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <Skeleton className="h-4 w-40" />
              </>
            ) : localBusiness.hasWebsite ? (
              <>
                <Globe className="w-4 h-4 text-green-500 flex-shrink-0" />
                <a 
                  href={localBusiness.website} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-green-500 hover:underline truncate max-w-[200px]"
                >
                  {localBusiness.website || 'Tiene página web'}
                </a>
              </>
            ) : localBusiness.hasWebsite === false ? (
              <>
                <Globe className="w-4 h-4 text-orange-500 flex-shrink-0" />
                <span className="text-orange-500 font-medium">🔥 Sin página web - ¡Oportunidad!</span>
              </>
            ) : (
              <>
                <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground italic">Estado web desconocido</span>
              </>
            )}
          </div>
        </div>

        {/* Error message */}
        {detailsError && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-4">
            <p className="text-sm text-destructive">{detailsError}</p>
          </div>
        )}

        {/* AI Analysis */}
        <div className={cn(
          'rounded-xl p-4 mb-6',
          statusInfo.isHot ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-secondary/50'
        )}>
          <div className="flex items-center gap-2 mb-2">
            {statusInfo.isHot ? (
              <Flame className="w-4 h-4 text-orange-500" />
            ) : (
              <Zap className="w-4 h-4 text-primary" />
            )}
            <span className="text-sm font-medium text-foreground">
              {statusInfo.isHot ? 'Oportunidad de Venta' : 'Análisis IA'}
            </span>
          </div>
          {loadingDetails ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {statusInfo.isHot 
                ? `Este negocio NO tiene página web. ${localBusiness.potentialReason}`
                : localBusiness.potentialReason
              }
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant={statusInfo.isHot ? 'hot' : localBusiness.temperature === 'hot' ? 'hot' : 'warm'}
            className={cn(
              'flex-1',
              statusInfo.isHot && 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600'
            )}
            onClick={() => onCreateWeb(localBusiness)}
            disabled={isCreatingWeb || loadingDetails}
          >
            {isCreatingWeb ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-5 h-5 border-2 border-current border-t-transparent rounded-full"
              />
            ) : loadingDetails ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando...
              </>
            ) : (
              <>
                {statusInfo.isHot && <Flame className="w-4 h-4" />}
                <Globe className="w-4 h-4" />
                Crear Web
              </>
            )}
          </Button>
          <Button variant="outline" size="icon">
            <ExternalLink className="w-4 h-4" />
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
