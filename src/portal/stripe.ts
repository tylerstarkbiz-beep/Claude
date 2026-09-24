// Loads Stripe.js on demand. Card details are typed into Stripe's own fields (Payment Element),
// so they go straight to Stripe and never pass through our server.
/* eslint-disable @typescript-eslint/no-explicit-any */
let loading: Promise<any> | null = null;

export function loadStripe(publishableKey: string): Promise<any> {
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://js.stripe.com/v3/';
      s.onload = () => resolve((window as any).Stripe);
      s.onerror = () => {
        loading = null;
        reject(new Error('Could not load the secure card form. Check your connection and try again.'));
      };
      document.head.appendChild(s);
    });
  }
  return loading.then((Stripe) => Stripe(publishableKey));
}
