import { useEffect, useRef } from 'react';
import './App.css';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to fill container
    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      draw(ctx);
    };

    const draw = (ctx: CanvasRenderingContext2D) => {
      // Clear canvas
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw "Hello World" text
      ctx.fillStyle = '#00ff00';
      ctx.font = '48px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('fusionCad v0.1.0', canvas.width / 2, canvas.height / 2 - 40);

      ctx.fillStyle = '#888';
      ctx.font = '24px monospace';
      ctx.fillText('Phase 0: Foundation Complete', canvas.width / 2, canvas.height / 2 + 20);

      ctx.font = '16px monospace';
      ctx.fillText('Canvas rendering works!', canvas.width / 2, canvas.height / 2 + 60);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1>fusionCad</h1>
        <div className="subtitle">Electrical CAD · Automation-First · Local-First</div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <h3>Tools</h3>
          <p>Phase 0 - Foundation</p>
          <ul>
            <li>✅ Monorepo structure</li>
            <li>✅ TypeScript setup</li>
            <li>✅ Core model types</li>
            <li>✅ Web app scaffold</li>
            <li>✅ CLI scaffold</li>
          </ul>
        </aside>

        <main className="canvas-container">
          <canvas ref={canvasRef} className="canvas" />
        </main>
      </div>
    </div>
  );
}
