import { useState, useEffect, useCallback, useRef } from 'react';

interface UseIdleDetectionOptions {
  /**
   * Time in milliseconds before user is considered idle
   * @default 30000 (30 seconds)
   */
  idleTime?: number;

  /**
   * Events to listen for user activity
   * @default ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']
   */
  events?: string[];
}

/**
 * Custom hook to detect user idle state for battery optimization
 * Returns true when user has been inactive for the specified time
 */
// Default events - defined outside component to avoid recreation
const DEFAULT_EVENTS = ['mousedown', 'keydown', 'touchstart', 'click'];

export function useIdleDetection(options: UseIdleDetectionOptions = {}): boolean {
  const {
    idleTime = 30000, // 30 seconds default
    events = DEFAULT_EVENTS // Use constant reference
  } = options;

  const [isIdle, setIsIdle] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(0);
  const eventsRef = useRef(events); // Store events in ref to prevent recreation

  // Update events ref if changed
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const handleActivity = useCallback(() => {
    const now = Date.now();

    // Throttle to max once per second
    if (now - lastActivityRef.current < 1000) {
      return;
    }

    lastActivityRef.current = now;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // User is active
    setIsIdle(false);

    // Set new timeout for idle detection
    timeoutRef.current = setTimeout(() => {
      setIsIdle(true);
    }, idleTime);
  }, [idleTime]);

  useEffect(() => {
    // Initial timeout
    timeoutRef.current = setTimeout(() => {
      setIsIdle(true);
    }, idleTime);

    // Add event listeners
    const currentEvents = eventsRef.current;
    currentEvents.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Cleanup on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      currentEvents.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [idleTime, handleActivity]); // handleActivity is stable now

  return isIdle;
}
