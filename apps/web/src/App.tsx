import { useEffect, useState, useCallback, useMemo } from 'react';
import './App.css';
import { registerBuiltinSymbols, registerSymbol, generatePLCDigitalSymbol, generatePLCAnalogSymbol, generateMicro800Symbol, MM_TO_PX } from '@fusion-cad/core-model';
import { registerBuiltinDrawFunctions } from './renderer/symbols';
import { useProjectPersistence } from './hooks/useProjectPersistence';
import { detectStorageProvider, IndexedDBStorageProvider, type StorageProvider, type StorageType } from './storage';
import { useCircuitState } from './hooks/useCircuitState';
import { useClipboard } from './hooks/useClipboard';
import { useTheme } from './hooks/useTheme';
import { useCanvasInteraction, type ManufacturerPart } from './hooks/useCanvasInteraction';
import { configureAmplify, useAuth } from './auth';
import { Header } from './components/Header';
import { Toolbar } from './components/Toolbar';
import { MenuBar, type MenuTab } from './components/MenuBar';
import { isSnapEnabled, setSnapEnabled, snapToGrid } from './types';
import { Sidebar } from './components/Sidebar';
import { RightPanel } from './components/RightPanel';
import { Canvas } from './components/Canvas';
import { captureRenderAudit } from './renderer/render-audit';
import { SheetTabs } from './components/SheetTabs';
import { ZoomControls } from './components/ZoomControls';
import { ReportsDialog } from './components/ReportsDialog';
import { ExportDialog } from './components/ExportDialog';
import { SymbolLibrary } from './components/SymbolLibrary';
import { SymbolEditor } from './components/SymbolEditor';
import { ERCDialog } from './components/ERCDialog';
import { PartsCatalog } from './components/PartsCatalog';
import { StatusBar } from './components/StatusBar';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { AIPromptDialog } from './components/AIPromptDialog';
import { AuthModal } from './components/AuthModal';
import { UpgradeCTA } from './components/UpgradeCTA';
import { fetchAllSymbols } from './api/symbols';

// Register draw functions synchronously (canvas renderers, not symbol data)
registerBuiltinDrawFunctions();

// Configure Amplify (returns false if env vars missing)
const authEnabled = configureAmplify();

export function App() {
  const auth = useAuth(authEnabled);
  const [storageProvider, setStorageProvider] = useState<StorageProvider | null>(null);
  const [storageType, setStorageType] = useState<StorageType | 'detecting'>('detecting');
  const [symbolsLoaded, setSymbolsLoaded] = useState(false);

  // Re-detect storage when auth state changes (after initial load)
  useEffect(() => {
    if (auth.isLoading) return;

    const getToken = auth.isAuthenticated ? auth.getAccessToken : undefined;
    detectStorageProvider(getToken).then(result => {
      setStorageProvider(result.provider);
      setStorageType(result.type);
    });
  }, [auth.isAuthenticated, auth.isLoading, auth.getAccessToken]);

  // Load symbols after storage detection
  useEffect(() => {
    if (!storageProvider || symbolsLoaded) return;

    async function loadSymbols() {
      if (storageType === 'rest') {
        try {
          const symbols = await fetchAllSymbols();
          for (const sym of symbols) {
            // API always returns converted format (geometry wrapper + pin position wrapper)
            // since PUT normalizes before storing. No format detection needed.
            registerSymbol(sym);
          }
          // Also register parametrically-generated PLC I/O defaults
          // (these aren't stored in the DB — they come from the generator)
          const plcDefs = [
            generatePLCDigitalSymbol('DI', 8), generatePLCDigitalSymbol('DI', 16),
            generatePLCDigitalSymbol('DO', 8), generatePLCDigitalSymbol('DO', 16),
            generatePLCAnalogSymbol('AI', 4), generatePLCAnalogSymbol('AI', 8),
            generatePLCAnalogSymbol('AO', 4), generatePLCAnalogSymbol('AO', 8),
          ];
          // Micro800 CPU symbols (Allen-Bradley)
          const micro800Models = ['micro820', 'micro830', 'micro850', 'micro870'];
          for (const model of micro800Models) {
            const sym = generateMicro800Symbol(model);
            if (sym) plcDefs.push(sym);
          }
          for (const def of plcDefs) {
            registerSymbol(def);
          }
          console.log(`Loaded ${symbols.length} symbols from API + ${plcDefs.length} PLC generators`);
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

  if (auth.isLoading || !storageProvider || !symbolsLoaded) {
    return (
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span style={{ color: '#ccc', fontSize: '14px' }}>
          {auth.isLoading ? 'Checking authentication...' : !storageProvider ? 'Detecting storage...' : 'Loading symbols...'}
        </span>
      </div>
    );
  }

  return (
    <AppInner
      storageProvider={storageProvider}
      storageType={storageType as StorageType}
      auth={auth}
      setStorageProvider={setStorageProvider}
      setStorageType={setStorageType}
    />
  );
}

function AppInner({
  storageProvider,
  storageType,
  auth,
  setStorageProvider,
  setStorageType,
}: {
  storageProvider: StorageProvider;
  storageType: StorageType;
  auth: ReturnType<typeof useAuth>;
  setStorageProvider: (p: StorageProvider) => void;
  setStorageType: (t: StorageType) => void;
}) {
  const theme = useTheme();
  const [showReports, setShowReports] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showSymbolLibrary, setShowSymbolLibrary] = useState(false);
  const [showERC, setShowERC] = useState(false);
  const [showPartsCatalog, setShowPartsCatalog] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showAIPrompt, setShowAIPrompt] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUpgradeCTA, setShowUpgradeCTA] = useState(false);
  const [pendingPartData, setPendingPartData] = useState<ManufacturerPart | null>(null);
  const [editSymbolId, setEditSymbolId] = useState<string | undefined>(undefined);
  const [activeMenuTab, setActiveMenuTab] = useState<MenuTab>('draw');
  const [snapEnabled, setSnapEnabledState] = useState(() => isSnapEnabled());
  const handleSetSnapEnabled = useCallback((v: boolean) => {
    setSnapEnabled(v);
    setSnapEnabledState(v);
  }, []);
  // Sync state when toggled via keyboard shortcut (G key)
  useEffect(() => {
    const handler = () => setSnapEnabledState(isSnapEnabled());
    window.addEventListener('snap-toggled', handler);
    return () => window.removeEventListener('snap-toggled', handler);
  }, []);

  const clearPendingPartData = useCallback(() => {
    setPendingPartData(null);
  }, []);

  const handleProjectLimitReached = useCallback(() => {
    setShowUpgradeCTA(true);
  }, []);

  const handleContinueLocally = useCallback(() => {
    setShowUpgradeCTA(false);
    // Switch to IndexedDB storage
    setStorageProvider(new IndexedDBStorageProvider());
    setStorageType('indexeddb');
  }, [setStorageProvider, setStorageType]);

  const handleSignOut = useCallback(async () => {
    await auth.logout();
    // Will trigger re-detect via useEffect in parent
  }, [auth]);

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

  const project = useProjectPersistence(storageProvider, handleProjectLimitReached);
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
    replaceWaypoints: circuitState.replaceWaypoints,
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
    rotateSelectedDevices: circuitState.rotateSelectedDevices,
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
        sheetConnections: interaction.sheetConnections,
        viewport: interaction.viewport,
        projectId: project.projectId,
        projectName: project.projectName,
        saveStatus: project.saveStatus,
        historyLength: circuitState.history.length,
        historyIndex: circuitState.historyIndex,
        activeSheetId: circuitState.activeSheetId,
        sheets: circuitState.sheets,
        alignSelectedDevices: circuitState.alignSelectedDevices,
        // Render audit — captures computed wire paths, device bounds, overlaps.
        // Dev-only. Call via: window.__fusionCadState.getRenderAudit()
        getRenderAudit: () => {
          const c = project.circuit;
          if (!c) return null;
          return captureRenderAudit(
            c,
            project.devicePositions,
            circuitState.activeSheetId,
            circuitState.sheets,
            c.transforms,
          );
        },
      };
    }
  }, [project.circuit, project.devicePositions, interaction.interactionMode,
      circuitState.selectedDevices, circuitState.selectedWireIndex, interaction.sheetConnections,
      interaction.viewport, project.projectId, project.projectName, project.saveStatus,
      circuitState.history, circuitState.historyIndex,
      circuitState.activeSheetId, circuitState.sheets, circuitState.alignSelectedDevices,
      project.circuit, project.devicePositions]);

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

  const pasteAtCenter = useCallback(() => {
    const canvas = interaction.canvasRef.current;
    if (canvas) {
      const mmScale = interaction.viewport.scale * MM_TO_PX;
      const centerX = (canvas.width / 2 - interaction.viewport.offsetX) / mmScale;
      const centerY = (canvas.height / 2 - interaction.viewport.offsetY) / mmScale;
      clipboardState.pasteDevice(centerX, centerY);
    }
  }, [interaction.canvasRef, interaction.viewport, clipboardState]);

  const selectAll = useCallback(() => {
    if (project.circuit) {
      circuitState.setSelectedDevices(project.circuit.devices.map(d => d.id));
    }
  }, [project.circuit, circuitState]);

  const triggerImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.fcad.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) project.importProject(file);
    };
    input.click();
  }, [project]);

  // Build ghost paste preview from clipboard data + mouse position
  const ghostPaste = useMemo(() => {
    if (!interaction.pastePreview || !clipboardState.clipboard || !interaction.mouseWorldPos) return null;

    const cb = clipboardState.clipboard;
    // Compute centroid of clipboard positions
    let cx = 0, cy = 0;
    for (const pos of cb.positions.values()) { cx += pos.x; cy += pos.y; }
    cx /= cb.positions.size;
    cy /= cb.positions.size;

    const mouseX = snapToGrid(interaction.mouseWorldPos.x);
    const mouseY = snapToGrid(interaction.mouseWorldPos.y);

    return cb.devices.map(device => {
      const part = device.partId ? cb.parts.find(p => p.id === device.partId) : null;
      const category = part?.symbolCategory || part?.category || 'unknown';
      const origPos = cb.positions.get(device.id) || { x: cx, y: cy };
      const transform = cb.transforms[device.id];
      return {
        category,
        x: snapToGrid(mouseX + (origPos.x - cx)),
        y: snapToGrid(mouseY + (origPos.y - cy)),
        tag: device.tag,
        rotation: transform?.rotation,
        mirrorH: transform?.mirrorH,
      };
    });
  }, [interaction.pastePreview, clipboardState.clipboard, interaction.mouseWorldPos]);

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
        exportProject={project.exportProject}
        importProject={project.importProject}
        circuit={project.circuit}
        onOpenReports={() => setShowReports(true)}
        onOpenExport={() => setShowExport(true)}
        onPrint={async () => {
          if (!project.circuit) return;
          const { printSheet } = await import('./export/pdf-export');
          await printSheet(project.circuit, project.devicePositions, {
            deviceTransforms: circuitState.deviceTransforms,
            title: project.projectName,
            allSheets: true,
          });
        }}
        onOpenSymbols={() => setShowSymbolLibrary(true)}
        onOpenParts={() => setShowPartsCatalog(true)}
        onOpenERC={() => setShowERC(true)}
        onOpenAIPrompt={() => setShowAIPrompt(true)}
        isAuthenticated={auth.isAuthenticated}
        userEmail={auth.user?.email}
        plan={auth.user?.plan}
        onSignIn={() => setShowAuthModal(true)}
        onSignOut={auth.isAuthenticated ? handleSignOut : undefined}
        storageType={storageType}
      />

      {/* Click outside to close menu */}
      {project.showProjectMenu && (
        <div className="menu-backdrop" onClick={() => project.setShowProjectMenu(false)} />
      )}

      <MenuBar
        activeTab={activeMenuTab}
        setActiveTab={setActiveMenuTab}
        projectName={project.projectName}
        saveStatus={project.saveStatus}
        onNewProject={project.createNewProject}
        onRenameProject={project.renameProject}
        onDeleteProject={project.deleteCurrentProject}
        onExportBackup={project.exportProject}
        onImportBackup={triggerImport}
        onOpenExport={() => setShowExport(true)}
        onPrint={async () => {
          if (!project.circuit) return;
          const { printSheet } = await import('./export/pdf-export');
          await printSheet(project.circuit, project.devicePositions, {
            deviceTransforms: circuitState.deviceTransforms,
            title: project.projectName,
            allSheets: true,
          });
        }}
        onOpenReports={() => setShowReports(true)}
        onSaveNow={project.saveNow}
        // Edit
        undo={circuitState.undo}
        redo={circuitState.redo}
        canUndo={circuitState.canUndo}
        canRedo={circuitState.canRedo}
        copyDevice={clipboardState.copyDevice}
        pasteDevice={pasteAtCenter}
        hasClipboard={!!clipboardState.clipboard}
        deleteDevices={circuitState.deleteDevices}
        deleteWire={circuitState.deleteWire}
        sheetConnections={interaction.sheetConnections}
        selectedDevices={circuitState.selectedDevices}
        selectedWireIndex={circuitState.selectedWireIndex}
        selectAll={selectAll}
        // Draw
        interactionMode={interaction.interactionMode}
        setInteractionMode={interaction.setInteractionMode}
        rotateSelectedDevices={circuitState.rotateSelectedDevices}
        mirrorDevice={circuitState.mirrorDevice}
        alignSelectedDevices={circuitState.alignSelectedDevices}
        // View
        zoomIn={() => interaction.setViewport(prev => ({ ...prev, scale: Math.min(prev.scale * 1.25, 5) }))}
        zoomOut={() => interaction.setViewport(prev => ({ ...prev, scale: Math.max(prev.scale / 1.25, 0.1) }))}
        zoomToFit={interaction.zoomToFit}
        zoomLevel={interaction.viewport.scale}
        debugMode={circuitState.debugMode}
        setDebugMode={circuitState.setDebugMode}
        snapEnabled={snapEnabled}
        setSnapEnabled={handleSetSnapEnabled}
        themeId={theme.themeId}
        setThemeId={theme.setThemeId}
        // Insert
        onOpenSymbolPalette={() => setShowSymbolLibrary(true)}
        onAddSheet={circuitState.addSheet}
        // Tools
        onOpenAIGenerate={() => setShowAIPrompt(true)}
        onOpenERC={() => setShowERC(true)}
        onOpenSymbolEditor={() => setEditSymbolId('_create_new_')}
        onOpenPartsCatalog={() => setShowPartsCatalog(true)}
        // Help
        onShowShortcuts={() => setShowShortcuts(true)}
      />

      <div className="layout">
        <Sidebar
          sheets={circuitState.sheets}
          activeSheetId={circuitState.activeSheetId}
          onSelectSheet={circuitState.setActiveSheetId}
          onAddSheet={circuitState.addSheet}
          onRenameSheet={circuitState.renameSheet}
          onDeleteSheet={circuitState.deleteSheet}
          activeSheet={circuitState.sheets.find(s => s.id === circuitState.activeSheetId) || null}
          onUpdateSheet={circuitState.updateSheet}
          sheetLayout={circuitState.getSheetLayout(circuitState.activeSheetId)}
          onSetSheetLayout={circuitState.setSheetLayout}
          themeId={theme.themeId}
          setThemeId={theme.setThemeId}
          customColors={theme.customColors}
          setCustomColors={theme.setCustomColors}
          debugMode={circuitState.debugMode}
          setDebugMode={circuitState.setDebugMode}
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
            sheetConnections={interaction.sheetConnections}
            renderHandleRef={interaction.renderHandleRef}
            onEditSymbol={(symbolKey) => setEditSymbolId(symbolKey)}
            alignSelectedDevices={circuitState.alignSelectedDevices}
            ghostPaste={ghostPaste}
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
            snapEnabled={snapEnabled}
            onToggleSnap={() => handleSetSnapEnabled(!snapEnabled)}
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
          sheetContext="schematic"
          wireStart={interaction.wireStart}
          selectedDevices={circuitState.selectedDevices}
          selectedWireIndex={circuitState.selectedWireIndex}
          circuit={project.circuit}
          deleteDevices={circuitState.deleteDevices}
          updateWireNumber={circuitState.updateWireNumber}
          onAssignPart={circuitState.assignPart}
          onUpdateDevice={circuitState.updateDevice}
          selectedAnnotationId={circuitState.selectedAnnotationId}
          onUpdateAnnotation={circuitState.updateAnnotation}
          onDeleteAnnotation={circuitState.deleteAnnotation}
          onSelectAnnotation={circuitState.selectAnnotation}
          sheetConnections={interaction.sheetConnections}
          projectName={project.projectName}
          projectId={project.projectId}
          onProjectChanged={project.reloadProject}
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

      {editSymbolId && (
        <SymbolEditor
          isOpen={true}
          onClose={() => setEditSymbolId(undefined)}
          onSave={() => {}}
          editSymbolId={editSymbolId === '_create_new_' ? undefined : editSymbolId}
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

      {showAIPrompt && project.projectId && (
        <AIPromptDialog
          projectId={project.projectId}
          onClose={() => setShowAIPrompt(false)}
          onGenerated={() => project.reloadProject()}
          getAccessToken={auth.isAuthenticated ? auth.getAccessToken : undefined}
          initialQuota={(auth.user as any)?.aiQuota ?? null}
        />
      )}

      {showAuthModal && (
        <AuthModal
          auth={auth}
          onClose={() => setShowAuthModal(false)}
        />
      )}

      {showUpgradeCTA && (
        <UpgradeCTA
          onClose={() => setShowUpgradeCTA(false)}
          onContinueLocally={handleContinueLocally}
        />
      )}
    </div>
  );
}
