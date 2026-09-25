import {
  formatDistanceLabel,
  haversineDistanceMeters,
  sortStopsNearestFirst,
} from './geo-distance.util';

describe('geo-distance.util', () => {
  it('computes short haversine distances in Pune area', () => {
    // ~1.1 km between nearby Kothrud points
    const meters = haversineDistanceMeters(18.5074, 73.8077, 18.5091, 73.812);
    expect(meters).toBeGreaterThan(400);
    expect(meters).toBeLessThan(2000);
  });

  it('formats meters and kilometers', () => {
    expect(formatDistanceLabel(420)).toBe('420 m');
    expect(formatDistanceLabel(1400)).toBe('1.4 km');
    expect(formatDistanceLabel(null)).toBeNull();
  });

  it('sorts nearest first and puts missing coords last among open stops', () => {
    const sorted = sortStopsNearestFirst([
      {
        customerName: 'Far',
        status: 'PENDING',
        distanceMeters: 1400,
        locationAvailable: true,
        deliverySequence: 1,
      },
      {
        customerName: 'NoPin',
        status: 'PENDING',
        distanceMeters: null,
        locationAvailable: false,
        deliverySequence: 2,
      },
      {
        customerName: 'Near',
        status: 'PENDING',
        distanceMeters: 400,
        locationAvailable: true,
        deliverySequence: 3,
      },
      {
        customerName: 'Done',
        status: 'DELIVERED',
        distanceMeters: 100,
        locationAvailable: true,
        deliverySequence: 4,
      },
    ]);
    expect(sorted.map((s) => s.customerName)).toEqual([
      'Near',
      'Far',
      'NoPin',
      'Done',
    ]);
  });
});
