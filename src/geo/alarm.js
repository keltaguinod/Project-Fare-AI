// alarm.js — the "Gising-Drop" offline GPS wake-up alarm (Killer Feature #2).
//
// A smartphone's GPS chip gets its position directly from orbital satellites, so
// it keeps working in Airplane Mode with zero cellular data or load. We use the
// HTML5 Geolocation API to watch the position, measure the straight-line
// distance to the destination stop, and fire a heavy haptic vibration ~300 m
// before arrival so an exhausted student never sleeps past their stop.
//
// No network, no map tiles, no reverse-geocoding — purely on-device math.

const EARTH_RADIUS_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle (haversine) distance in meters between two {lat,lng} points. */
export function haversineMeters(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * One-shot current position (for "I just boarded — use my location as origin").
 * Satellite GPS, so it works offline. Resolves {lat, lng, accuracy}.
 */
export function locate({ timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Walang GPS / Geolocation sa device na ito."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) => reject(err),
      { enableHighAccuracy: true, maximumAge: 0, timeout }
    );
  });
}

/** Heavy, attention-grabbing vibration pattern (ms on/off). */
export const BUZZ_PATTERN = [400, 150, 400, 150, 600];

export function canVibrate() {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export function buzz(pattern = BUZZ_PATTERN) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* vibration is a best-effort nicety */
  }
}

/**
 * Start the arrival alarm.
 *
 * @param {{lat:number,lng:number}} destCoords  destination stop coordinates
 * @param {object} [opts]
 * @param {number} [opts.radiusMeters=300]  how early to buzz
 * @param {(info:{distanceMeters:number, accuracy:number, triggered:boolean})=>void} [opts.onUpdate]
 * @param {(info:{distanceMeters:number})=>void} [opts.onTrigger]  fires once when inside the radius
 * @param {(err:GeolocationPositionError|Error)=>void} [opts.onError]
 * @returns {{ stop: () => void }}  call stop() to cancel the alarm
 */
export function startArrivalAlarm(destCoords, opts = {}) {
  const { radiusMeters = 300, onUpdate, onTrigger, onError } = opts;

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    onError?.(new Error("Walang GPS / Geolocation sa device na ito."));
    return { stop() {} };
  }

  let triggered = false;
  let stopped = false;

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (stopped) return;
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const distanceMeters = haversineMeters(here, destCoords);
      const accuracy = pos.coords.accuracy;

      onUpdate?.({ distanceMeters, accuracy, triggered });

      if (!triggered && distanceMeters <= radiusMeters) {
        triggered = true;
        buzz();
        onTrigger?.({ distanceMeters });
      }
    },
    (err) => onError?.(err),
    {
      enableHighAccuracy: true, // use the GPS chip, not coarse Wi-Fi/cell
      maximumAge: 0,
      timeout: 30000,
    }
  );

  return {
    stop() {
      stopped = true;
      navigator.geolocation.clearWatch(watchId);
    },
  };
}
