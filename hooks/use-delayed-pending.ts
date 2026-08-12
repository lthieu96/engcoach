"use client";

import { useEffect, useState } from "react";

// Avoid flashing feedback for requests that complete before a person can notice it.
export function useDelayedPending(pending: boolean, delay = 200) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!pending) {
      setVisible(false);
      return;
    }
    const timeout = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timeout);
  }, [pending, delay]);

  return visible;
}
