import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const PUBLIC_PREVIEW_ORIGIN = "https://id-preview--880774cd-cfc7-4eaf-9add-10630c9f5ca7.lovable.app";

export function getShareableAppOrigin() {
  if (typeof window === "undefined") {
    return PUBLIC_PREVIEW_ORIGIN;
  }

  return window.location.hostname.endsWith(".lovableproject.com")
    ? PUBLIC_PREVIEW_ORIGIN
    : window.location.origin;
}
