/**
 * ZoomControls - floating zoom buttons in bottom-right corner of canvas
 */
import type { Viewport } from '../renderer/types';

interface ZoomControlsProps {
  viewport: Viewport;
  setViewport: React.Dispatch<React.SetStateAction<Viewport>>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onZoomToFit: () => void;
}

export function ZoomControls({ viewport, setViewport, canvasRef, onZoomToFit }: ZoomControlsProps) {
  const zoomPercent = Math.round(viewport.scale * 100);

  const zoomBy = (factor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const newScale = Math.min(Math.max(viewport.scale * factor, 0.1), 5);
    const scaleRatio = newScale / viewport.scale;
    setViewport({
      offsetX: centerX - (centerX - viewport.offsetX) * scaleRatio,
      offsetY: centerY - (centerY - viewport.offsetY) * scaleRatio,
      scale: newScale,
    });
  };

  const zoomTo100 = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const scaleRatio = 1 / viewport.scale;
    setViewport({
      offsetX: centerX - (centerX - viewport.offsetX) * scaleRatio,
      offsetY: centerY - (centerY - viewport.offsetY) * scaleRatio,
      scale: 1,
    });
  };

  return (
    <div className="zoom-controls">
      <button className="zoom-btn" onClick={() => zoomBy(1.25)} title="Zoom In (+)">+</button>
      <button className="zoom-btn zoom-level-btn" onClick={zoomTo100} title="Reset to 100%">
        {zoomPercent}%
      </button>
      <button className="zoom-btn" onClick={() => zoomBy(0.8)} title="Zoom Out (-)">-</button>
      <button className="zoom-btn zoom-fit-btn" onClick={onZoomToFit} title="Zoom to Fit (Ctrl+0)">Fit</button>
    </div>
  );
}
