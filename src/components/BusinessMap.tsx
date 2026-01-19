import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Business } from '@/data/mockData';
import { Loader2 } from 'lucide-react';
import { getCategoryEmoji } from '@/lib/categoryIcons';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface BusinessMapProps {
  businesses: Business[];
  selectedBusiness: Business | null;
  onBusinessSelect: (business: Business) => void;
  center: [number, number];
}

const createCustomIcon = (business: Business) => {
  const categoryEmoji = getCategoryEmoji(business.category);
  
  // Determine if this is a confirmed hot opportunity (no website)
  const isHotOpportunity = business.hasWebsite === false;
  const hasWebsite = business.hasWebsite === true;
  
  // Color based on status
  let color: string;
  let glowColor: string;
  
  if (isHotOpportunity) {
    color = '#f97316'; // orange-500
    glowColor = '#f9731666';
  } else if (hasWebsite) {
    color = '#22c55e'; // green-500
    glowColor = '#22c55e66';
  } else {
    // Unknown/pending - use muted color
    color = '#6b7280'; // gray-500
    glowColor = '#6b728066';
  }

  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        width: 40px;
        height: 40px;
        background: ${color};
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 3px solid white;
        box-shadow: 0 4px 12px ${glowColor};
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
      ">
        <div style="
          transform: rotate(45deg);
          font-size: 16px;
          color: white;
          font-weight: bold;
        ">
          ${categoryEmoji}
        </div>
        ${isHotOpportunity ? `
          <div style="
            position: absolute;
            top: -8px;
            right: -8px;
            transform: rotate(45deg);
            font-size: 14px;
          ">
            🔥
          </div>
        ` : ''}
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
  });
};

export const BusinessMap = ({
  businesses,
  selectedBusiness,
  onBusinessSelect,
  center,
}: BusinessMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: center,
      zoom: 15,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    }).addTo(map);

    mapRef.current = map;
    setIsLoading(false);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update center and fit bounds when businesses change
  useEffect(() => {
    if (!mapRef.current) return;
    
    if (businesses.length > 0) {
      // Create bounds from all business locations
      const bounds = L.latLngBounds(businesses.map(b => [b.lat, b.lng]));
      mapRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    } else {
      mapRef.current.setView(center, 15);
    }
  }, [center, businesses]);

  // Update markers when businesses change
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    // Add new markers
    businesses.forEach((business) => {
      const marker = L.marker([business.lat, business.lng], {
        icon: createCustomIcon(business),
      });

      const isHot = business.hasWebsite === false;
      const statusBadge = isHot 
        ? '<span style="background: #f97316; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">🔥 Sin web</span>'
        : business.hasWebsite === true
        ? '<span style="background: #22c55e; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">✓ Tiene web</span>'
        : '<span style="background: #6b7280; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">Verificar</span>';

      marker.bindPopup(`
        <div style="padding: 8px; min-width: 180px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <h3 style="font-weight: bold; margin: 0;">${business.name}</h3>
            ${isHot ? '<span style="font-size: 16px;">🔥</span>' : ''}
          </div>
          <p style="font-size: 12px; color: #666; margin: 0 0 4px 0;">${business.category}</p>
          <p style="font-size: 11px; margin: 0 0 8px 0;">${business.address}</p>
          ${statusBadge}
        </div>
      `);

      marker.on('click', () => {
        onBusinessSelect(business);
      });

      marker.addTo(mapRef.current!);
      markersRef.current.push(marker);
    });
  }, [businesses, onBusinessSelect]);

  return (
    <div className="h-full w-full rounded-xl overflow-hidden relative">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary/50 z-10">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-primary mx-auto mb-3 animate-spin" />
            <p className="text-muted-foreground">Cargando mapa...</p>
          </div>
        </div>
      )}
      <div 
        ref={containerRef} 
        className="h-full w-full"
        style={{ background: '#0a0f1a' }}
      />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-background/20 to-transparent" />
    </div>
  );
};
