import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from "react-leaflet";
import L from 'leaflet';
import { Store, User, Navigation, Clock, Map as MapIcon, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Fix for default marker icons in Leaflet with React
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface Market {
  id: number;
  name: string;
  location: string;
  lat: number;
  lng: number;
  type?: 'market' | 'boutique';
  has_sellers?: boolean | number;
}

interface Seller {
  id: number;
  name: string;
  shop_name?: string;
  lat?: number;
  lng?: number;
  phone?: string;
}

interface MapProps {
  markets: Market[];
  sellers?: Seller[];
  onSelectMarket: (market: Market) => void;
  onSelectSeller?: (seller: Seller) => void;
  selectedMarketId: number | null;
  selectedSellerId?: number | null;
  onMapClick?: (lat: number, lng: number) => void;
  onViewSellers?: (market: Market) => void;
  sellerLocation?: { lat: number, lng: number } | null;
  userLocation?: { lat: number, lng: number } | null;
  showItinerary?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  highlightedMarketIds?: number[];
}

const defaultCenter: [number, number] = [6.3654, 2.4183];

// Component to handle map view updates (pan/zoom) and interactions
function MapController({ center, zoom, bounds, isExpanded }: { center?: [number, number], zoom?: number, bounds?: L.LatLngBoundsExpression, isExpanded: boolean }) {
  const map = useMap();
  
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (center) {
      map.setView(center, zoom || map.getZoom());
    }
  }, [center, zoom, bounds, map]);

  useEffect(() => {
    if (isExpanded) {
      map.dragging.enable();
      map.touchZoom.enable();
      map.doubleClickZoom.enable();
      map.scrollWheelZoom.enable();
      if ((map as any).tap) (map as any).tap.enable();
    } else {
      map.dragging.disable();
      map.touchZoom.disable();
      map.doubleClickZoom.disable();
      map.scrollWheelZoom.disable();
      if ((map as any).tap) (map as any).tap.disable();
    }
  }, [isExpanded, map]);
  
  return null;
}

export default function Map({ 
  markets, 
  sellers = [], 
  onSelectMarket, 
  onSelectSeller,
  selectedMarketId, 
  selectedSellerId,
  onMapClick, 
  onViewSellers,
  sellerLocation, 
  userLocation,
  showItinerary = false,
  isExpanded = false,
  onToggleExpand,
  highlightedMarketIds = []
}: MapProps) {
  const [hoveredSeller, setHoveredSeller] = useState<Seller | null>(null);

  const selectedSeller = sellers.find(s => s.id === selectedSellerId);
  const selectedMarket = markets.find(m => m.id === selectedMarketId);
  
  const targetLocation = selectedSeller?.lat && selectedSeller?.lng 
    ? { lat: selectedSeller.lat, lng: selectedSeller.lng } 
    : (isExpanded && selectedMarket)
      ? { lat: selectedMarket.lat, lng: selectedMarket.lng }
      : sellerLocation;

  // Custom icons using the pattern requested by the user
  const redIcon = L.icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  const greenIcon = L.icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  const blueIcon = L.icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  const goldIcon = L.icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  const blackIcon = L.icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-black.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Calculate bounds for auto-zoom
  let mapBounds: L.LatLngBoundsExpression | undefined;
  if (showItinerary && userLocation && targetLocation) {
    mapBounds = [
      [userLocation.lat, userLocation.lng],
      [targetLocation.lat, targetLocation.lng]
    ];
  } else if (isExpanded && userLocation && markets.length > 0) {
    const points: [number, number][] = [[userLocation.lat, userLocation.lng]];
    markets.forEach(m => points.push([m.lat, m.lng]));
    mapBounds = points;
  }

  return (
    <div className="relative w-full h-full bg-slate-50 rounded-[3rem] border border-slate-100 overflow-hidden shadow-inner">
      <MapContainer 
        center={userLocation ? [userLocation.lat, userLocation.lng] : defaultCenter} 
        zoom={13} 
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
        className="map-container"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        
        <MapController 
          center={targetLocation ? [targetLocation.lat, targetLocation.lng] : undefined}
          zoom={selectedSellerId ? 16 : 15}
          bounds={mapBounds}
          isExpanded={isExpanded}
        />

        {/* Market Markers */}
        {markets.map((market) => {
          const distance = userLocation ? calculateDistance(userLocation.lat, userLocation.lng, market.lat, market.lng) : null;
          const hasSellers = !!market.has_sellers;
          const isHighlighted = highlightedMarketIds.includes(market.id);
          
          return (
            <Marker
              key={`market-${market.id}`}
              position={[market.lat, market.lng]}
              eventHandlers={{
                click: () => onSelectMarket(market),
              }}
              icon={isHighlighted ? blueIcon : (hasSellers ? blueIcon : blackIcon)}
            >
              <Popup>
                <div className="p-1 min-w-[150px]">
                  <div className="font-black text-slate-900 mb-1">{market.name}</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">{market.location}</div>
                  
                  {distance !== null && (
                    <div className="flex items-center gap-1 text-blue-600 font-black text-xs mb-3">
                      <Navigation className="w-3 h-3" />
                      {distance.toFixed(1)} km
                    </div>
                  )}

                  {hasSellers ? (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onViewSellers) {
                          onViewSellers(market);
                        } else {
                          onSelectMarket(market);
                        }
                      }}
                      className="w-full bg-blue-600 text-white py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all"
                    >
                      Voir les vendeurs
                    </button>
                  ) : (
                    <div className="text-[9px] text-slate-400 italic text-center">
                      Aucun vendeur inscrit ici
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Seller Markers */}
        {selectedMarketId && !isExpanded && sellers.map((seller) => {
          if (!seller.lat || !seller.lng) return null;
          return (
            <Marker
              key={`seller-${seller.id}`}
              position={[seller.lat, seller.lng]}
              eventHandlers={{
                click: () => onSelectSeller && onSelectSeller(seller),
              }}
              icon={goldIcon}
            >
              <Popup>
                <div className="font-bold">{seller.shop_name || seller.name}</div>
              </Popup>
            </Marker>
          );
        })}

        {/* User Marker */}
        {userLocation && (
          <Marker
            position={[userLocation.lat, userLocation.lng]}
            icon={redIcon}
          >
            <Popup>Vous êtes ici</Popup>
          </Marker>
        )}

        {/* Itinerary (Simple line for Leaflet) */}
        {showItinerary && userLocation && targetLocation && (
          <Polyline 
            positions={[
              [userLocation.lat, userLocation.lng],
              [targetLocation.lat, targetLocation.lng]
            ]}
            color="#2563eb"
            weight={6}
            opacity={0.8}
            dashArray="10, 10"
          />
        )}
      </MapContainer>

      {/* Map Controls */}
      <div className="absolute top-6 right-6 flex flex-col gap-3 z-[1000]">
        {isExpanded && onToggleExpand && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className="p-4 bg-white rounded-2xl shadow-xl border border-slate-100 text-slate-600 hover:bg-slate-50 transition-all"
            title="Réduire la carte"
          >
            <X className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="absolute bottom-6 right-6 bg-white/90 backdrop-blur-md p-4 rounded-2xl border border-white shadow-xl z-[1000] text-[10px] font-black uppercase tracking-widest space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-600 shadow-sm" />
          <span className="text-slate-600">Marché avec vendeurs sur Net Market</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-slate-900 shadow-sm" />
          <span className="text-slate-600">Marché sans vendeurs inscrits</span>
        </div>
      </div>

      {/* Info Panel (Reused from previous implementation) */}
      <AnimatePresence>
        {(showItinerary || hoveredSeller) && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-8 left-8 right-8 md:right-auto md:w-80 bg-white/90 backdrop-blur-2xl p-6 rounded-[2.5rem] border border-white shadow-2xl z-[500]"
          >
            {hoveredSeller ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center">
                    <Store className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900">{hoveredSeller.shop_name || hoveredSeller.name}</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Vendeur vérifié</p>
                  </div>
                </div>
              </div>
            ) : (selectedSeller || (isExpanded && selectedMarket)) && showItinerary ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-100">
                      <Navigation className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900">Itinéraire</h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Navigation à vol d'oiseau</p>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400">
                      <User className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-slate-600 truncate">Ma position</span>
                  </div>
                  <div className="ml-4 border-l-2 border-dashed border-slate-100 h-4" />
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                      <Store className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-slate-900 truncate">
                      {selectedSeller ? (selectedSeller.shop_name || selectedSeller.name) : (selectedMarket?.name)}
                    </span>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    const dest = targetLocation;
                    if (dest && userLocation) {
                      window.open(`https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${dest.lat},${dest.lng}&travelmode=walking`, '_blank');
                    }
                  }}
                  className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-blue-600 transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-100"
                >
                  <MapIcon className="w-5 h-5" /> Ouvrir dans Google Maps
                </button>
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
