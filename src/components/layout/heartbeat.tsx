"use client";

import { useEffect } from "react";

export function Heartbeat() {
  useEffect(() => {
    const id = setInterval(() => {
      fetch("/api/heartbeat", { method: "POST" }).catch(() => {});
    }, 5000);
    fetch("/api/heartbeat", { method: "POST" }).catch(() => {});
    return () => clearInterval(id);
  }, []);
  return null;
}
