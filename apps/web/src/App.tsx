import { useEffect, useState, useCallback } from 'react';
import './App.css';
import { registerBuiltinSymbols, registerSymbol } from '@fusion-cad/core-model';
import { registerBuiltinDrawFunctions } from './renderer/symbols';
import { useProjectPersistence } from './hooks/useProjectPersistence';
import { detectStorageProvider, type StorageProvider, type StorageType } from './storage';
import { useCircuitState } from './hooks/useCircuitState';
import { useClipboard } from './hooks/useClipboard';
import { useCanvasInteraction, type ManufacturerPart } from './hooks/useCanvasInteraction';
import { Header } from './components/Header';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { RightPanel } from './components/RightPanel';
import { Canvas } from './components/Canvas';
import { SheetTabs } from './components/SheetTabs';
import { ZoomControls } from './components/ZoomControls';
import { ReportsDialog } from './components/ReportsDialog';
import { ExportDialog } from './components/ExportDialog';
import { SymbolLibrary } from './components/SymbolLibrary';
import { ERCDialog } from './components/ERCDialog';
import { PartsCatalog } from './components/PartsCatalog';
import { StatusBar } from './components/StatusBar';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { fetchAllSymbols } from './api/symbols';

// Register draw functions synchronously (canvas renderers, not symbol data)
registerBuiltinDrawFunctions();

export function App() {
  const [storageProvider, setStorageProvider] = useState<StorageProvider | null>(null);
  const [storageType, setStorageType] = useState<StorageType | 'detecting'>('detecting');
  const [symbolsLoaded, setSymbolsLoaded] = useState(false);

  // Detect storage provider on mount
  useEffect(() => {
    detectStorageProvider().then(result => {
      setStorageProvider(result.provider);
      setStorageType(result.type);
    });
  }, []);

  // Load symbols after storage detection
  useEffect(() => {
    if (!storageProvider || symbolsLoaded) return;

    async function loadSymbols() {
      if (storageType === 'rest') {
        try {
          const symbols = await fetchAllSymbols();
          for (const sym of symbols) {
            registerSymbol(sym);
          }
          console.log(`Loaded ${symbols.length} symbols from API`);
          setSymbolsLoaded(true);
          return;
        } catch {
          console.warn('Failed to load symbols from API, falling back to static JSON');
        }
      }
      // Fallback: load from static JSON (IndexedDB mode or API failure)
      registerBuiltinSymbols();
      setSymbolsLoaded(true);
    }

    loadSymbols();
  }, [storageProvider, storageType, symbolsLoaded]);

  if (!storageProvider || !symbolsLoaded) {
    return (
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span style={{ color: '#ccc', fontSize: '14px' }}>
          {!storageProvider ? 'Detecting storage...' : 'Loading symbols...'}
        </span>
      </div>
    );
  }

  return <AppInner storageProvider={storageProvider} storageType={storageType as StorageType} />;
}

function AppInner({ storageProvider, storageType }: { storageProvider: StorageProvider; storageType: StorageType }) {
  const [showReports, setShowReports] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showSymbolLibrary, setShowSymbolLibrary] = useState(false);
  const [showERC, setShowERC] = useState(false);
  const [showPartsCatalog, setShowPartsCatalog] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [pendingPartData, setPendingPartData] = useState<ManufacturerPart | null>(null);

  const clearPendingPartData = useCallback(() => {
    setPendingPartData(null);
  }, []);

  // Load custom symbols from storage on mount
  useEffect(() => {
    if (storageProvider.listCustomSymbols) {
      storageProvider.listCustomSymbols().then(symbols => {
        for (const sym of symbols) {
          registerSymbol(sym);
        }
      }).catch(() => {/* ignore */});
    }
  }, [storageProvider]);

  const project = useProjectPersistence(storageProvider);
  const circuitState = useCircuitState(
    project.circuit,
    project.setCircuit,
    project.devicePositions,
    project.setDevicePositions
  );
  const clipboardState = useClipboard(
    project.circuit,
    project.setCircuit,
    project.setDevicePositions,
    circuitState.selectedDevices,
    circuitState.setSelectedDevices,
    circuitState.getAllPositions,
    circuitState.pushToHistory
  );
  const interaction = useCanvasInteraction({
    circuit: project.circuit,
    selectedDevices: circuitState.selectedDevices,
    setSelectedDevices: circuitState.setSelectedDevices,
    selectedWireIndex: circuitState.selectedWireIndex,
    setSelectedWireIndex: circuitState.setSelectedWireIndex,
    getAllPositions: circuitState.getAllPositions,
    placeSymbol: circuitState.placeSymbol,
    pendingPartData,
    clearPendingPartData,
    createWireConnection: circuitState.createWireConnection,
    deleteDevices: circuitState.deleteDevices,
    deleteWire: circuitState.deleteWire,
    addWaypoint: circuitState.addWaypoint,
    moveWaypoint: circuitState.moveWaypoint,
    removeWaypoint: circuitState.removeWaypoint,
    reconnectWire: circuitState.reconnectWire,
    connectToWire: circuitState.connectToWire,
    addAnnotation: circuitState.addAnnotation,
    copyDevice: clipboardState.copyDevice,
    pasteDevice: clipboardState.pasteDevice,
    duplicateDevice: clipboardState.duplicateDevice,
    clipboard: clipboardState.clipboard,
    pushToHistoryRef: circuitState.pushToHistoryRef,
    undoRef: circuitState.undoRef,
    redoRef: circuitState.redoRef,
    devicePositions: project.devicePositions,
    setDevicePositions: project.setDevicePositions,
    rotateDevice: circuitState.rotateDevice,
    mirrorDevice: circuitState.mirrorDevice,
    deviceTransforms: circuitState.deviceTransforms,
    selectAnnotation: circuitState.selectAnnotation,
    activeSheetId: circuitState.activeSheetId,
  });

  // Expose state for E2E testing (dev mode only)
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as any).__fusionCadState = {
        circuit: project.circuit,
        devicePositions: Object.fromEntries(project.devicePositions),
        interactionMode: interaction.interactionMode,
        selectedDevices: circuitState.selectedDevices,
        selectedWireIndex: circuitState.selectedWireIndex,
        viewport: interaction.viewport,
        projectId: project.projectId,
        projectName: project.projectName,
        saveStatus: project.saveStatus,
        historyLength: circuitState.history.length,
        historyIndex: circuitState.historyIndex,
        activeSheetId: circuitState.activeSheetId,
        sheets: circuitState.sheets,
      };
    }
  }, [project.circuit, project.devicePositions, interaction.interactionMode,
      circuitState.selectedDevices, circuitState.selectedWireIndex, interaction.viewport,
      project.projectId, project.projectName, project.saveStatus,
      circuitState.history, circuitState.historyIndex,
      circuitState.activeSheetId, circuitState.sheets]);

  // Global keydown listener for ? to show shortcuts help
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        // Don't trigger when typing in inputs
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        setShowShortcuts(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  return (
    <div className="app">
      <Header
        projectId={project.projectId}
        projectName={project.projectName}
        saveStatus={project.saveStatus}
        projectsList={project.projectsList}
        showProjectMenu={project.showProjectMenu}
        setShowProjectMenu={project.setShowProjectMenu}
        switchProject={project.switchProject}
        createNewProject={project.createNewProject}
        deleteCurrentProject={project.deleteCurrentProject}
        renameProject={project.renameProject}
        circuit={project.circuit}
        onOpenReports={() => setShowReports(true)}
        onOpenExport={() => setShowExport(true)}
        onOpenSymbols={() => setShowSymbolLibrary(true)}
        onOpenParts={() => setShowPartsCatalog(true)}
        onOpenERC={() => setShowERC(true)}
      />

      {/* Click outside to close menu */}
      {project.showProjectMenu && (
        <div className="menu-backdrop" onClick={() => project.setShowProjectMenu(false)} />
      )}

      <Toolbar
        selectedDevices={circuitState.selectedDevices}
        selectedWireIndex={circuitState.selectedWireIndex}
        interactionMode={interaction.interactionMode}
        setInteractionMode={interaction.setInteractionMode}
        rotateDevice={circuitState.rotateDevice}
        mirrorDevice={circuitState.mirrorDevice}
        deleteDevices={circuitState.deleteDevices}
        deleteWire={circuitState.deleteWire}
        copyDevice={clipboardState.copyDevice}
        pasteDevice={() => {
          // Paste at center of viewport
          const canvas = interaction.canvasRef.current;
          if (canvas) {
            const centerX = (canvas.width / 2 - interaction.viewport.offsetX) / interaction.viewport.scale;
            const centerY = (canvas.height / 2 - interaction.viewport.offsetY) / interaction.viewport.scale;
            clipboardState.pasteDevice(centerX, centerY);
          }
        }}
        hasClipboard={!!clipboardState.clipboard}
        undo={circuitState.undo}
        redo={circuitState.redo}
        canUndo={circuitState.canUndo}
        canRedo={circuitState.canRedo}
        zoomIn={() => interaction.setViewport(prev => ({ ...prev, scale: Math.min(prev.scale * 1.25, 5) }))}
        zoomOut={() => interaction.setViewport(prev => ({ ...prev, scale: Math.max(prev.scale / 1.25, 0.1) }))}
        zoomToFit={interaction.zoomToFit}
        zoomLevel={interaction.viewport.scale}
      />

      <div className="layout">
        <Sidebar
          interactionMode={interaction.interactionMode}
          placementCategory={interaction.placementCategory}
          wireStart={interaction.wireStart}
          selectedDevices={circuitState.selectedDevices}
          selectedWireIndex={circuitState.selectedWireIndex}
          circuit={project.circuit}
          deleteDevices={circuitState.deleteDevices}
          updateWireNumber={circuitState.updateWireNumber}
          debugMode={circuitState.debugMode}
          setDebugMode={circuitState.setDebugMode}
          onAssignPart={circuitState.assignPart}
          onUpdateDevice={circuitState.updateDevice}
          selectedAnnotationId={circuitState.selectedAnnotationId}
          onUpdateAnnotation={circuitState.updateAnnotation}
          onDeleteAnnotation={circuitState.deleteAnnotation}
          onSelectAnnotation={circuitState.selectAnnotation}
        />

        <div className="canvas-area">
          <Canvas
            canvasRef={interaction.canvasRef}
            circuit={project.circuit}
            viewport={interaction.viewport}
            debugMode={circuitState.debugMode}
            devicePositions={project.devicePositions}
            selectedDevices={circuitState.selectedDevices}
            selectedWireIndex={circuitState.selectedWireIndex}
            wireStart={interaction.wireStart}
            interactionMode={interaction.interactionMode}
            placementCategory={interaction.placementCategory}
            mouseWorldPos={interaction.mouseWorldPos}
            draggingEndpoint={interaction.draggingEndpoint}
            isLoading={project.isLoading}
            activeSheetId={circuitState.activeSheetId}
            deviceTransforms={circuitState.deviceTransforms}
            marquee={interaction.marquee}
            contextMenu={interaction.contextMenu}
            setContextMenu={interaction.setContextMenu}
            rotateDevice={circuitState.rotateDevice}
            mirrorDevice={circuitState.mirrorDevice}
            deleteDevices={circuitState.deleteDevices}
            selectedWireIndexValue={circuitState.selectedWireIndex}
            addWaypoint={circuitState.addWaypoint}
            pasteDevice={clipboardState.pasteDevice}
            clipboard={clipboardState.clipboard}
            selectedAnnotationId={circuitState.selectedAnnotationId}
          />

          <ZoomControls
            viewport={interaction.viewport}
            setViewport={interaction.setViewport}
            canvasRef={interaction.canvasRef}
            onZoomToFit={interaction.zoomToFit}
          />

          <SheetTabs
            sheets={circuitState.sheets}
            activeSheetId={circuitState.activeSheetId}
            onSelectSheet={circuitState.setActiveSheetId}
            onAddSheet={circuitState.addSheet}
            onRenameSheet={circuitState.renameSheet}
            onDeleteSheet={circuitState.deleteSheet}
          />

          <StatusBar
            mouseWorldPos={interaction.mouseWorldPos}
            viewport={interaction.viewport}
            interactionMode={interaction.interactionMode}
            selectedCount={circuitState.selectedDevices.length}
            storageType={storageType}
          />
        </div>

        <RightPanel
          onSelectSymbol={(symbolId, _category) => {
            interaction.setInteractionMode('place');
            interaction.setPlacementCategory(symbolId as any);
            interaction.setWireStart(null);
            circuitState.setSelectedDevices([]);
          }}
          interactionMode={interaction.interactionMode}
          placementCategory={interaction.placementCategory}
        />
      </div>

      {showReports && (
        <ReportsDialog
          circuit={project.circuit}
          onClose={() => setShowReports(false)}
        />
      )}

      {showExport && (
        <ExportDialog
          circuit={project.circuit}
          positions={circuitState.getAllPositions()}
          deviceTransforms={circuitState.deviceTransforms}
          activeSheetId={circuitState.activeSheetId}
          projectName={project.projectName}
          onClose={() => setShowExport(false)}
        />
      )}

      {showSymbolLibrary && (
        <SymbolLibrary
          onClose={() => setShowSymbolLibrary(false)}
          onSelectSymbol={(category) => {
            interaction.setInteractionMode('place');
            interaction.setPlacementCategory(category);
          }}
          storageProvider={storageProvider}
        />
      )}

      {showERC && (
        <ERCDialog
          circuit={project.circuit}
          onClose={() => setShowERC(false)}
        />
      )}

      {showPartsCatalog && (
        <PartsCatalog
          onClose={() => setShowPartsCatalog(false)}
          onPlacePart={(part, symbolCategory) => {
            setShowPartsCatalog(false);
            setPendingPartData(part);
            interaction.setInteractionMode('place');
            interaction.setPlacementCategory(symbolCategory);
          }}
        />
      )}

      {showShortcuts && (
        <ShortcutsHelp onClose={() => setShowShortcuts(false)} />
      )}
    </div>
  );
}
