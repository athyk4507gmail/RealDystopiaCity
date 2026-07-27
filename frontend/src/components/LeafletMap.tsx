"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polygon, Polyline, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapLine, MapMarker, MapPolygon } from "./MapboxMap";

// Fix default marker icons in Next.js
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

function MapUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center[1], center[0]], zoom);
  }, [center, zoom, map]);
  return null;
}

interface LeafletMapProps {
  center?: [number, number];
  zoom?: number;
  markers?: MapMarker[];
  lines?: MapLine[];
  polygons?: MapPolygon[];
  heatmapPoints?: { lat: number; lng: number; weight: number }[];
  className?: string;
}

export default function LeafletMap({
  center = [77.5946, 12.9716],
  zoom = 11,
  markers = [],
  lines = [],
  polygons = [],
  heatmapPoints = [],
  className = "h-full w-full",
}: LeafletMapProps) {
  return (
    <div className={className}>
      <MapContainer
        center={[center[1], center[0]]}
        zoom={zoom}
        className="h-full w-full rounded-xl"
        style={{ background: "#0b0f19" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <MapUpdater center={center} zoom={zoom} />

        {polygons.map((poly) => (
          <Polygon
            key={poly.id}
            positions={poly.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number])}
            pathOptions={{
              color: poly.lineColor || "#06b6d4",
              fillColor: poly.fillColor || "#06b6d4",
              fillOpacity: poly.fillOpacity ?? 0.35,
              weight: 2,
            }}
          />
        ))}

        {lines.map((line) => (
          <Polyline
            key={line.id}
            positions={line.coordinates.map(([lng, lat]) => [lat, lng] as [number, number])}
            pathOptions={{
              color: line.color || "#06b6d4",
              weight: line.width || 4,
            }}
          />
        ))}

        {heatmapPoints.map((p, i) => (
          <CircleMarker
            key={`heat-${i}`}
            center={[p.lat, p.lng]}
            radius={8 + p.weight * 20}
            pathOptions={{
              color: p.weight > 0.7 ? "#ef4444" : p.weight > 0.45 ? "#f59e0b" : "#06b6d4",
              fillColor: p.weight > 0.7 ? "#ef4444" : p.weight > 0.45 ? "#f59e0b" : "#06b6d4",
              fillOpacity: 0.5,
              weight: 1,
            }}
          />
        ))}

        {markers.map((m) => (
          <Marker key={m.id} position={[m.lat, m.lng]}>
            {m.popup && <Popup><div dangerouslySetInnerHTML={{ __html: m.popup }} /></Popup>}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
