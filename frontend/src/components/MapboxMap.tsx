"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

const LeafletMap = dynamic(() => import("./LeafletMap"), { ssr: false });

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export interface MapMarker {
  id: string | number;
  lat: number;
  lng: number;
  color?: string;
  label?: string;
  popup?: string;
  className?: string;
}

export interface MapLine {
  id: string | number;
  coordinates: number[][];
  color?: string;
  width?: number;
}

export interface MapPolygon {
  id: string | number;
  coordinates: number[][][];
  fillColor?: string;
  fillOpacity?: number;
  lineColor?: string;
  popup?: string;
  onPolygonClick?: (polygon: MapPolygon) => void;
}

export interface MapLegendItem {
  color: string;
  label: string;
}

interface MapboxMapProps {
  center?: [number, number];
  zoom?: number;
  markers?: MapMarker[];
  lines?: MapLine[];
  polygons?: MapPolygon[];
  heatmapPoints?: { lat: number; lng: number; weight: number }[];
  className?: string;
  legendItems?: MapLegendItem[];
  onMapReady?: (map: mapboxgl.Map) => void;
}

export default function MapboxMap(props: MapboxMapProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className={props.className ?? "h-full w-full"} aria-hidden />;
  }

  const useMapbox = Boolean(mapboxgl.accessToken);

  if (!useMapbox) {
    return <LeafletMap {...props} />;
  }

  return <MapboxMapInner {...props} />;
}

function MapboxMapInner({
  center = [77.5946, 12.9716],
  zoom = 11,
  markers = [],
  lines = [],
  polygons = [],
  heatmapPoints = [],
  className = "h-full w-full",
  legendItems = [],
  onMapReady,
}: MapboxMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center,
      zoom,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current = map;
    onMapReady?.(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    markers.forEach((marker) => {
      const el = document.createElement("div");
      el.className = marker.className || "car-marker";
      if (marker.color) el.style.background = marker.color;

      const m = new mapboxgl.Marker(el)
        .setLngLat([marker.lng, marker.lat])
        .addTo(map);

      if (marker.popup) {
        m.setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML(marker.popup));
      }
      markersRef.current.push(m);
    });
  }, [markers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const setup = () => updateLayers();

    if (!map.isStyleLoaded()) {
      map.once("load", setup);
      return;
    }
    setup();

    function updateLayers() {
      if (!map) return;

      lines.forEach((line) => {
        const id = `line-${line.id}`;
        if (map.getSource(id)) {
          (map.getSource(id) as mapboxgl.GeoJSONSource).setData({
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: line.coordinates },
          });
        } else {
          map.addSource(id, {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: line.coordinates },
            },
          });
          map.addLayer({
            id: `${id}-layer`,
            type: "line",
            source: id,
            paint: {
              "line-color": line.color || "#06b6d4",
              "line-width": line.width || 4,
            },
          });
        }
      });

      polygons.forEach((poly) => {
        const id = `poly-${poly.id}`;
        const data = {
          type: "Feature" as const,
          properties: { popup: poly.popup || "" },
          geometry: { type: "Polygon" as const, coordinates: poly.coordinates },
        };
        const fillId = `${id}-fill`;
        const lineId = `${id}-line`;

        if (map.getSource(id)) {
          (map.getSource(id) as mapboxgl.GeoJSONSource).setData(data);
          if (map.getLayer(fillId)) {
            map.setPaintProperty(fillId, "fill-color", poly.fillColor || "#06b6d4");
            map.setPaintProperty(fillId, "fill-opacity", poly.fillOpacity ?? 0.45);
          }
          if (map.getLayer(lineId)) {
            map.setPaintProperty(lineId, "line-color", poly.lineColor || "#06b6d4");
          }
        } else {
          map.addSource(id, { type: "geojson", data });
          map.addLayer({
            id: fillId,
            type: "fill",
            source: id,
            paint: {
              "fill-color": poly.fillColor || "#06b6d4",
              "fill-opacity": poly.fillOpacity ?? 0.45,
            },
          });
          map.addLayer({
            id: lineId,
            type: "line",
            source: id,
            paint: { "line-color": poly.lineColor || "#06b6d4", "line-width": 2 },
          });

          const showPopup = (e: mapboxgl.MapLayerMouseEvent) => {
            if (poly.onPolygonClick) {
              poly.onPolygonClick(poly);
            }
            const feature = e.features?.[0];
            const html = feature?.properties?.popup;
            if (!html) return;
            if (popupRef.current) popupRef.current.remove();
            popupRef.current = new mapboxgl.Popup({ closeOnClick: true, offset: 15 })
              .setLngLat(e.lngLat)
              .setHTML(String(html))
              .addTo(map);
          };

          map.on("click", fillId, showPopup);
          map.on("mouseenter", fillId, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", fillId, () => {
            map.getCanvas().style.cursor = "";
          });
        }
      });

      if (heatmapPoints.length > 0) {
        const id = "heatmap";
        const features = heatmapPoints.map((p) => ({
          type: "Feature" as const,
          properties: { weight: p.weight },
          geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        }));
        const data = { type: "FeatureCollection" as const, features };
        if (map.getSource(id)) {
          (map.getSource(id) as mapboxgl.GeoJSONSource).setData(data);
        } else {
          map.addSource(id, { type: "geojson", data });
          map.addLayer({
            id: "heatmap-layer",
            type: "heatmap",
            source: id,
            paint: {
              "heatmap-weight": ["get", "weight"],
              "heatmap-intensity": 1,
              "heatmap-color": [
                "interpolate", ["linear"], ["heatmap-density"],
                0, "rgba(6,182,212,0)",
                0.5, "rgba(245,158,11,0.6)",
                1, "rgba(239,68,68,0.9)",
              ],
              "heatmap-radius": 30,
            },
          });
        }
      }
    }
  }, [lines, polygons, heatmapPoints]);

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="h-full w-full" />
      {legendItems.length > 0 && (
        <div className="absolute bottom-3 left-3 z-10 rounded-lg border border-border bg-card/95 p-3 text-xs shadow-lg">
          <p className="font-medium text-slate-300 mb-2">Today&apos;s Supply Status</p>
          <div className="space-y-1.5">
            {legendItems.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-slate-400">
                <span
                  className="w-3 h-3 rounded-sm border border-white/20 shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
