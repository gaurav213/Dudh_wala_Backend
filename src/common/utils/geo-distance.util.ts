/**
 * Straight-line (Haversine) distance helpers.
 * Isolated so driving-route providers can replace this later.
 */

const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Returns distance in meters between two WGS84 points. */
export function haversineDistanceMeters(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/** Human label: meters when &lt; 1 km, otherwise kilometers. */
export function formatDistanceLabel(
  distanceMeters: number | null,
): string | null {
  if (distanceMeters == null || !Number.isFinite(distanceMeters)) return null;
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }
  const km = distanceMeters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export function parseCoordinate(
  value: string | number | null | undefined,
): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

export type RouteSortableStop = {
  distanceMeters: number | null;
  locationAvailable: boolean;
  status?: string;
  deliverySequence?: number | null;
  customerName?: string | null;
};

/**
 * Nearest-first: open stops with coords by distance, then open without coords,
 * then closed. Stable secondary keys keep UI predictable without location.
 */
export function sortStopsNearestFirst<T extends RouteSortableStop>(
  stops: T[],
): T[] {
  const openStatuses = new Set(['PENDING', 'OUT_FOR_DELIVERY']);
  return [...stops].sort((a, b) => {
    const aOpen = !a.status || openStatuses.has(a.status) ? 0 : 1;
    const bOpen = !b.status || openStatuses.has(b.status) ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;

    const aHas = a.locationAvailable && a.distanceMeters != null ? 0 : 1;
    const bHas = b.locationAvailable && b.distanceMeters != null ? 0 : 1;
    if (aHas !== bHas) return aHas - bHas;

    if (
      a.distanceMeters != null &&
      b.distanceMeters != null &&
      a.distanceMeters !== b.distanceMeters
    ) {
      return a.distanceMeters - b.distanceMeters;
    }

    const seqA = a.deliverySequence ?? 1 << 30;
    const seqB = b.deliverySequence ?? 1 << 30;
    if (seqA !== seqB) return seqA - seqB;

    return (a.customerName ?? '').localeCompare(b.customerName ?? '');
  });
}
