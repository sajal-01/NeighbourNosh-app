// ── Shared donation data ──────────────────────────────────────────────────────
// Single source of truth for active donation records used by Track tab and
// the Track Delivery detail screen.

export type LatLng = { latitude: number; longitude: number };

export type DonationPartner = {
  name: string;
  rating: string;
  deliveries: number;
  avatarUrl?: string;
};

export type TrackingInfo = {
  pickupCoords: LatLng;
  pickupName: string;
  pickupAddress: string;
  riderCoords: LatLng;
  destinationCoords: LatLng;
  /** Ordered list of coordinates for the route polyline */
  routeCoords: LatLng[];
  estimatedMinutes: number;
  distanceKm: string;
  pickedUpAt: string;
};

export type DonationRecord = {
  id: string;
  image: string;
  name: string;
  qty: string;
  meals: number;
  dietType: 'Veg' | 'Non-Veg';
  dropoffName: string;
  dropoffAddress: string;
  deliveryStatus: string;
  expectedMins: number;
  partner: DonationPartner;
  tracking: TrackingInfo;
};

export const DONATIONS_DATA: DonationRecord[] = [
  {
    id: 'don_001',
    image:
      'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=200&h=200&fit=crop&q=80',
    name: 'Paneer Curry',
    qty: '30 Servings',
    meals: 30,
    dietType: 'Veg',
    dropoffName: 'Annapoorna Shelter',
    dropoffAddress: '12, Silk Board Junction, Bengaluru, Karnataka - 560068',
    deliveryStatus: 'On the way',
    expectedMins: 22,
    partner: {
      name: 'Ramesh K.',
      rating: '4.8',
      deliveries: 128,
      avatarUrl:
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&q=80',
    },
    tracking: {
      pickupCoords: { latitude: 12.9716, longitude: 77.5946 },
      pickupName: 'Green Leaf Restaurant',
      pickupAddress: 'MG Road, Bengaluru',
      riderCoords: { latitude: 12.9530, longitude: 77.6130 },
      destinationCoords: { latitude: 12.9179, longitude: 77.6230 },
      routeCoords: [
        { latitude: 12.9716, longitude: 77.5946 },
        { latitude: 12.9700, longitude: 77.5980 },
        { latitude: 12.9682, longitude: 77.6015 },
        { latitude: 12.9660, longitude: 77.6048 },
        { latitude: 12.9635, longitude: 77.6075 },
        { latitude: 12.9605, longitude: 77.6100 },
        { latitude: 12.9575, longitude: 77.6120 },
        { latitude: 12.9530, longitude: 77.6130 },
        { latitude: 12.9490, longitude: 77.6148 },
        { latitude: 12.9445, longitude: 77.6168 },
        { latitude: 12.9390, longitude: 77.6190 },
        { latitude: 12.9330, longitude: 77.6210 },
        { latitude: 12.9270, longitude: 77.6225 },
        { latitude: 12.9179, longitude: 77.6230 },
      ],
      estimatedMinutes: 22,
      distanceKm: '4.1',
      pickedUpAt: '01:15 PM',
    },
  },
  {
    id: 'don_002',
    image:
      'https://images.unsplash.com/photo-1596797038530-2c107229654b?w=200&h=200&fit=crop&q=80',
    name: 'Veg Pulao',
    qty: '25 Servings',
    meals: 25,
    dietType: 'Veg',
    dropoffName: 'Hope NGO Shelter',
    dropoffAddress: '45, 2nd Cross Rd, Domlur Layout, Bengaluru, Karnataka - 560071',
    deliveryStatus: 'On the way',
    expectedMins: 12,
    partner: {
      name: 'Ramesh K.',
      rating: '4.8',
      deliveries: 128,
      avatarUrl:
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&q=80',
    },
    tracking: {
      pickupCoords: { latitude: 12.9716, longitude: 77.5946 },
      pickupName: 'Green Leaf Restaurant',
      pickupAddress: 'MG Road, Bengaluru',
      riderCoords: { latitude: 12.9660, longitude: 77.6148 },
      destinationCoords: { latitude: 12.9603, longitude: 77.6383 },
      routeCoords: [
        { latitude: 12.9716, longitude: 77.5946 },
        { latitude: 12.9715, longitude: 77.5990 },
        { latitude: 12.9712, longitude: 77.6030 },
        { latitude: 12.9707, longitude: 77.6068 },
        { latitude: 12.9698, longitude: 77.6100 },
        { latitude: 12.9685, longitude: 77.6122 },
        { latitude: 12.9672, longitude: 77.6138 },
        { latitude: 12.9660, longitude: 77.6148 },
        { latitude: 12.9648, longitude: 77.6193 },
        { latitude: 12.9637, longitude: 77.6244 },
        { latitude: 12.9626, longitude: 77.6290 },
        { latitude: 12.9617, longitude: 77.6333 },
        { latitude: 12.9609, longitude: 77.6360 },
        { latitude: 12.9603, longitude: 77.6383 },
      ],
      estimatedMinutes: 12,
      distanceKm: '3.2',
      pickedUpAt: '02:30 PM',
    },
  },
  {
    id: 'don_003',
    image:
      'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=200&h=200&fit=crop&q=80',
    name: 'Dal Tadka',
    qty: '20 Servings',
    meals: 20,
    dietType: 'Veg',
    dropoffName: 'Care & Share Shelter',
    dropoffAddress: '8, 5th Block, Koramangala, Bengaluru, Karnataka - 560095',
    deliveryStatus: 'On the way',
    expectedMins: 30,
    partner: {
      name: 'Arun Kumar',
      rating: '4.9',
      deliveries: 210,
      avatarUrl:
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&q=80',
    },
    tracking: {
      pickupCoords: { latitude: 12.9352, longitude: 77.6245 },
      pickupName: 'Home Kitchen',
      pickupAddress: '4th Block, Koramangala, Bengaluru',
      riderCoords: { latitude: 12.9318, longitude: 77.6198 },
      destinationCoords: { latitude: 12.9270, longitude: 77.6130 },
      routeCoords: [
        { latitude: 12.9352, longitude: 77.6245 },
        { latitude: 12.9345, longitude: 77.6228 },
        { latitude: 12.9338, longitude: 77.6215 },
        { latitude: 12.9330, longitude: 77.6208 },
        { latitude: 12.9325, longitude: 77.6202 },
        { latitude: 12.9318, longitude: 77.6198 },
        { latitude: 12.9308, longitude: 77.6184 },
        { latitude: 12.9297, longitude: 77.6167 },
        { latitude: 12.9284, longitude: 77.6151 },
        { latitude: 12.9276, longitude: 77.6140 },
        { latitude: 12.9270, longitude: 77.6130 },
      ],
      estimatedMinutes: 30,
      distanceKm: '1.8',
      pickedUpAt: '03:00 PM',
    },
  },
];

export function getDonationById(id: string): DonationRecord | undefined {
  return DONATIONS_DATA.find((d) => d.id === id);
}
