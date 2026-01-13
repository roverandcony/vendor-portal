const CARRIER_URLS: Record<string, (trackingNumber: string) => string> = {
  DHL: (t) => `https://www.dhl.com/global-en/home/tracking.html?tracking-id=${t}`,
  UPS: (t) => `https://www.ups.com/track?tracknum=${t}`,
  FedEx: (t) => `https://www.fedex.com/fedextrack/?trknbr=${t}`,
  USPS: (t) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${t}`,
};

export function buildTrackingUrl(
  carrier: string | null | undefined,
  trackingNumber: string | null | undefined
) {
  const trimmed = trackingNumber?.trim();
  if (!carrier || !trimmed) return null;
  const builder = CARRIER_URLS[carrier];
  if (!builder) return null;
  return builder(trimmed);
}
