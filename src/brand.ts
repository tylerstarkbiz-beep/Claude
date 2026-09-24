import { useEffect, useState } from 'react';
import { api } from './api';
import { DEFAULT_BRAND, DEFAULT_LOGO } from '../shared/brand';

export interface Branding {
  name: string;
  logo: string | null;
  brandColor: string;
  accentColor: string;
  phone: string;
  email: string;
}

/** Point the brand-* / accent-* palettes at the company's colors and name the browser tab. */
export function applyBrand(b: Pick<Branding, 'brandColor' | 'accentColor' | 'name'>, title = b.name) {
  const root = document.documentElement.style;
  root.setProperty('--brand', b.brandColor);
  root.setProperty('--accent', b.accentColor);
  document.title = title;
}

const FALLBACK: Branding = { name: 'Big Country Cleanup & Restoration', logo: DEFAULT_LOGO, phone: '', email: '', ...DEFAULT_BRAND };

/** Public branding for customer-facing pages (portal, invoice links), which don't load office data. */
export function useBranding(title?: (name: string) => string) {
  const [brand, setBrand] = useState<Branding>(FALLBACK);
  useEffect(() => {
    api<Branding>('/public/branding')
      .then((b) => {
        setBrand(b);
        applyBrand(b, title ? title(b.name) : b.name);
      })
      .catch(() => applyBrand(FALLBACK));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return brand;
}
