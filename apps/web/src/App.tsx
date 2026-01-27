import { useEffect, useRef, useState } from 'react';
import './App.css';
import { createGoldenCircuitMotorStarter } from '@fusion-cad/project-io';
import { renderCircuit, type CircuitData } from './renderer/circuit-renderer';
import type { Viewport } from './renderer/types';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [circuit, setCircuit] = useState<CircuitData | null>(null);
  const [viewport] = useState<Viewport>({
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  });

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
      renderCircuit(ctx, circuit, viewport);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [circuit, viewport]);

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
            <li>🟡 Symbol rendering</li>
            <li>🟡 Wire rendering</li>
            <li>⚪ Symbol placement</li>
            <li>⚪ Wire tool</li>
          </ul>
        </aside>

        <main className="canvas-container">
          <canvas ref={canvasRef} className="canvas" />
        </main>
      </div>
    </div>
  );
}
