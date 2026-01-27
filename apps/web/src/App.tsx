import { useEffect, useRef, useState } from 'react';
import './App.css';
import { createGoldenCircuitMotorStarter } from '@fusion-cad/project-io';
import { renderCircuit, type CircuitData } from './renderer/circuit-renderer';
import type { Viewport } from './renderer/types';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [circuit, setCircuit] = useState<CircuitData | null>(null);
  const [viewport, setViewport] = useState<Viewport>({
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  });
  const [debugMode, setDebugMode] = useState(false); // Start with debug mode OFF for clean screenshots

  // Track dragging state
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  // Load golden circuit on mount
  useEffect(() => {
    const goldenCircuit = createGoldenCircuitMotorStarter();
    setCircuit({
      devices: goldenCircuit.devices,
      nets: goldenCircuit.nets,
      parts: goldenCircuit.parts,
      connections: goldenCircuit.connections,
    });
  }, []);

  // Render circuit when loaded or canvas resizes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !circuit) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      renderCircuit(ctx, circuit, viewport, debugMode);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [circuit, viewport, debugMode]);

  // Pan/zoom controls
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Mouse wheel: zoom in/out
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Zoom factor: negative deltaY = zoom in, positive = zoom out
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = viewport.scale * zoomFactor;

      // Clamp scale between 0.1x and 5x
      const clampedScale = Math.min(Math.max(newScale, 0.1), 5);

      // Zoom towards mouse position
      const scaleRatio = clampedScale / viewport.scale;
      const newOffsetX = mouseX - (mouseX - viewport.offsetX) * scaleRatio;
      const newOffsetY = mouseY - (mouseY - viewport.offsetY) * scaleRatio;

      setViewport({
        offsetX: newOffsetX,
        offsetY: newOffsetY,
        scale: clampedScale,
      });
    };

    // Mouse drag: pan canvas
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) { // Left click only
        isDraggingRef.current = true;
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'grabbing';
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const deltaX = e.clientX - lastMousePosRef.current.x;
      const deltaY = e.clientY - lastMousePosRef.current.y;

      setViewport(prev => ({
        ...prev,
        offsetX: prev.offsetX + deltaX,
        offsetY: prev.offsetY + deltaY,
      }));

      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      canvas.style.cursor = 'grab';
    };

    // Add event listeners
    canvas.addEventListener('wheel', handleWheel);
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // Set initial cursor
    canvas.style.cursor = 'grab';

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [viewport]);

  return (
    <div className="app">
      <header className="header">
        <h1>fusionCad</h1>
        <div className="subtitle">Electrical CAD · Automation-First · Local-First</div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <h3>Golden Circuit</h3>
          <p>3-Wire Motor Starter</p>
          {circuit && (
            <ul>
              <li>Devices: {circuit.devices.length}</li>
              <li>Connections: {circuit.connections.length}</li>
              <li>Nets: {circuit.nets.length}</li>
            </ul>
          )}
          <h3 style={{ marginTop: '2rem' }}>Phase 2</h3>
          <p>Canvas Rendering</p>
          <ul>
            <li>✅ Symbol rendering</li>
            <li>✅ Wire rendering</li>
            <li>✅ Pan/zoom controls</li>
            <li>⚪ Symbol placement</li>
            <li>⚪ Wire tool</li>
          </ul>
          <h3 style={{ marginTop: '2rem' }}>Controls</h3>
          <ul>
            <li>🖱️ Drag to pan</li>
            <li>🔍 Scroll to zoom</li>
          </ul>
          <h3 style={{ marginTop: '2rem' }}>Debug Mode</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={debugMode}
              onChange={(e) => setDebugMode(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>Show wire labels</span>
          </label>
          <p style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
            Shows wire numbers (W001, W002), net names, and device:pin labels at connection points.
          </p>
        </aside>

        <main className="canvas-container">
          <canvas ref={canvasRef} className="canvas" />
        </main>
      </div>
    </div>
  );
}
