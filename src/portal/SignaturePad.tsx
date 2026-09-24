import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export interface SignaturePadHandle {
  /** PNG data URL of the signature, or null if nothing was drawn. */
  toDataUrl: () => string | null;
  clear: () => void;
}

/** Draw-with-finger/mouse signature box. */
export const SignaturePad = forwardRef<SignaturePadHandle, { onChange?: (hasInk: boolean) => void }>(function SignaturePad({ onChange }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [ink, setInk] = useState(false);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  useImperativeHandle(ref, () => ({
    toDataUrl: () => (ink ? canvas.current!.toDataURL('image/png') : null),
    clear: () => {
      const c = canvas.current!;
      c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
      setInk(false);
      onChange?.(false);
    },
  }));

  return (
    <canvas
      ref={canvas}
      aria-label="Signature box: sign with your finger or mouse"
      className="h-40 w-full touch-none rounded-lg border-2 border-dashed border-slate-300 bg-white"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drawing.current = true;
        last.current = point(e);
      }}
      onPointerMove={(e) => {
        if (!drawing.current || !last.current) return;
        const ctx = canvas.current!.getContext('2d')!;
        const p = point(e);
        ctx.beginPath();
        ctx.moveTo(last.current.x, last.current.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        last.current = p;
        if (!ink) {
          setInk(true);
          onChange?.(true);
        }
      }}
      onPointerUp={() => {
        drawing.current = false;
        last.current = null;
      }}
    />
  );
});
