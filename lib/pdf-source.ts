"use client";
import { useEffect, useSyncExternalStore } from "react";
import type { PdfTrack } from "@/lib/pdf";

/** What the Account menu's "Download PDF" exports: the list the current page is showing (filters and sort applied).
 *  A list page publishes it with usePublishPdf; pages with no list publish nothing, so the menu item is hidden there. */
export type PdfSource = { title: string; tracks: PdfTrack[] };

let current: PdfSource | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function usePdfSource(): PdfSource | null {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => current,
    () => null
  );
}

export function usePublishPdf(title: string, tracks: PdfTrack[]) {
  useEffect(() => {
    current = { title, tracks };
    emit();
  }, [title, tracks]);
  useEffect(() => () => { current = null; emit(); }, []); // page left: nothing to export
}
