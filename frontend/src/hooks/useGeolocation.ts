import { useEffect, useRef, useState, useCallback } from 'react';
import { geolocationApi, PositionResponse, GeofenceEvent } from '../api/geolocation';

interface GeolocationState {
  isTracking: boolean;
  permissionStatus: 'prompt' | 'granted' | 'denied' | 'unknown';
  lastPosition: { lat: number; lng: number; accuracy?: number } | null;
  nearLocations: PositionResponse['nearLocations'];
  lastEvents: { entered: GeofenceEvent[]; exited: GeofenceEvent[] } | null;
  error: string | null;
}

const SEND_INTERVAL = 60_000; // send to backend every 60s

export function useGeolocation(enabled: boolean = true) {
  const [state, setState] = useState<GeolocationState>({
    isTracking: false,
    permissionStatus: 'unknown',
    lastPosition: null,
    nearLocations: [],
    lastEvents: null,
    error: null,
  });

  const watchIdRef = useRef<number | null>(null);
  const lastSendRef = useRef<number>(0);
  const pendingPositionRef = useRef<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const intervalRef = useRef<number | null>(null);

  // Check permission on mount
  useEffect(() => {
    if (!enabled) return;
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then(result => {
        setState(s => ({ ...s, permissionStatus: result.state as any }));
        result.onchange = () => {
          setState(s => ({ ...s, permissionStatus: result.state as any }));
        };
      }).catch(() => {});
    }
  }, [enabled]);

  const sendPosition = useCallback(async (lat: number, lng: number, accuracy?: number) => {
    const now = Date.now();
    if (now - lastSendRef.current < SEND_INTERVAL) {
      pendingPositionRef.current = { lat, lng, accuracy };
      return;
    }
    lastSendRef.current = now;
    pendingPositionRef.current = null;

    try {
      const result = await geolocationApi.updatePosition(lat, lng, accuracy);
      setState(s => ({
        ...s,
        nearLocations: result.nearLocations,
        lastEvents: (result.entered.length > 0 || result.exited.length > 0)
          ? { entered: result.entered, exited: result.exited }
          : s.lastEvents,
        error: null,
      }));
    } catch {
      // Silent fail — don't break tracking
    }
  }, []);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setState(s => ({ ...s, error: 'Geolokalizacja nie jest obsługiwana' }));
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setState(s => ({
          ...s,
          isTracking: true,
          lastPosition: { lat: latitude, lng: longitude, accuracy },
          permissionStatus: 'granted',
          error: null,
        }));
        sendPosition(latitude, longitude, accuracy);
      },
      (err) => {
        setState(s => ({
          ...s,
          isTracking: false,
          error: err.code === 1 ? 'Brak uprawnień GPS' : 'Błąd GPS',
          permissionStatus: err.code === 1 ? 'denied' : s.permissionStatus,
        }));
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
    );

    watchIdRef.current = watchId;

    // Periodic flush of pending position
    intervalRef.current = window.setInterval(() => {
      const pending = pendingPositionRef.current;
      if (pending) {
        lastSendRef.current = 0; // force send
        sendPosition(pending.lat, pending.lng, pending.accuracy);
      }
    }, SEND_INTERVAL);
  }, [sendPosition]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setState(s => ({ ...s, isTracking: false }));
  }, []);

  const clearEvents = useCallback(() => {
    setState(s => ({ ...s, lastEvents: null }));
  }, []);

  // Auto-start when enabled
  useEffect(() => {
    if (enabled) {
      startTracking();
    }
    return () => stopTracking();
  }, [enabled, startTracking, stopTracking]);

  return {
    ...state,
    startTracking,
    stopTracking,
    clearEvents,
  };
}
