/** Minimal Naver Maps JS API v3 typings for this app */
declare namespace naver.maps {
  namespace Event {
    function addListener(
      target: unknown,
      eventName: string,
      listener: (e: unknown) => void,
    ): void;
  }
  class Map {
    constructor(el: HTMLElement, opts: MapOptions);
    setCenter(latlng: LatLng): void;
    setZoom(z: number): void;
    getCenter(): LatLng;
    getZoom(): number;
    panTo(latlng: LatLng): void;
  }
  class LatLng {
    constructor(lat: number, lng: number);
    lat(): number;
    lng(): number;
  }
  class Marker {
    constructor(opts: MarkerOptions);
    setMap(map: Map | null): void;
    setPosition(ll: LatLng): void;
    getPosition(): LatLng;
  }
  class Polyline {
    constructor(opts: PolylineOptions);
    setMap(map: Map | null): void;
    setPath(path: LatLng[] | LatLngLiteral[]): void;
  }
  interface MapOptions {
    center: LatLng | LatLngLiteral;
    zoom: number;
    mapTypeControl?: boolean;
    zoomControl?: boolean;
  }
  interface MarkerOptions {
    position: LatLng | LatLngLiteral;
    map?: Map | null;
    icon?: unknown;
    title?: string;
    zIndex?: number;
  }
  interface PolylineOptions {
    map?: Map | null;
    path: LatLng[] | LatLngLiteral[];
    strokeWeight?: number;
    strokeColor?: string;
    strokeOpacity?: number;
    strokeStyle?: string;
    zIndex?: number;
  }
  interface LatLngLiteral {
    lat: number;
    lng: number;
  }
  class Point {
    constructor(x: number, y: number);
  }
  class Size {
    constructor(w: number, h: number);
  }
  class HtmlIcon {
    constructor(opts: { content: string; anchor?: Point; size?: Size });
  }
}
