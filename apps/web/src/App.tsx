import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
import { FindReplaceDialog } from './components/FindReplaceDialog';
import { SymbolImportDialog } from './components/SymbolImportDialog';
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

      // Restore user-imported symbols from localStorage
      try {
        const stored = JSON.parse(localStorage.getItem('fusionCad_importedSymbols') || '[]');
        for (const sym of stored) {
          registerSymbol(sym);
        }
        if (stored.length > 0) console.log(`Restored ${stored.length} imported symbol(s)`);
      } catch { /* ignore */ }

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
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showSymbolImport, setShowSymbolImport] = useState(false);
  const [symbolLibVersion, setSymbolLibVersion] = useState(0);
  const [showPartsCatalog, setShowPartsCatalog] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [pendingImage, setPendingImage] = useState<{ dataUrl: string; widthMm: number; heightMm: number } | null>(null);
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
    circuitState.pushToHistory,
    circuitState.activeSheetId,
    circuitState.selectedAnnotationIds
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
    updateWireField: circuitState.updateWireField,
    connectToWire: circuitState.connectToWire,
    addAnnotation: circuitState.addAnnotation,
    addShapeAnnotation: circuitState.addShapeAnnotation,
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
    updateAnnotation: circuitState.updateAnnotation,
    moveAnnotations: circuitState.moveAnnotations,
    deleteAnnotation: circuitState.deleteAnnotation,
    selectedAnnotationIds: circuitState.selectedAnnotationIds,
    activeSheetId: circuitState.activeSheetId,
    panelScale: circuitState.getPanelScale(circuitState.activeSheetId),
  });

  // Image import handler — reads file, converts to base64, enters placement mode
  const handleImageFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('Image too large. Maximum size is 10MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const pxToMm = 0.2646;
        let widthMm = img.width * pxToMm;
        let heightMm = img.height * pxToMm;
        if (widthMm > 200) {
          const scale = 200 / widthMm;
          widthMm *= scale;
          heightMm *= scale;
        }
        setPendingImage({ dataUrl, widthMm, heightMm });
        interaction.setInteractionMode('select');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, [interaction]);

  // Place pending image on canvas click
  useEffect(() => {
    if (!pendingImage) return;
    const canvas = interaction.canvasRef.current;
    if (!canvas) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // left click only
      e.stopPropagation();
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mmScale = MM_TO_PX * interaction.viewport.scale;
      const worldX = (e.clientX - rect.left - interaction.viewport.offsetX) / mmScale;
      const worldY = (e.clientY - rect.top - interaction.viewport.offsetY) / mmScale;
      const snappedX = snapToGrid(worldX);
      const snappedY = snapToGrid(worldY);
      circuitState.addImageAnnotation(snappedX, snappedY, pendingImage.dataUrl, pendingImage.widthMm, pendingImage.heightMm);
      setPendingImage(null);
    };
    // Use capture phase to intercept before the interaction hook's handlers
    canvas.addEventListener('mousedown', handleMouseDown, { capture: true, once: true });
    return () => canvas.removeEventListener('mousedown', handleMouseDown, { capture: true });
  }, [pendingImage, interaction.canvasRef, interaction.viewport, circuitState]);

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
        selectedAnnotationIds: circuitState.selectedAnnotationIds,
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
      // Cmd/Ctrl+F = Find/Replace
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowFindReplace(true);
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
      const sheetDevices = project.circuit.devices.filter(d => d.sheetId === circuitState.activeSheetId);
      circuitState.setSelectedDevices(sheetDevices.map(d => d.id));
      // Also select all annotations on the active sheet
      // Set IDs directly to avoid selectAnnotation's side effect of clearing devices
      const sheetAnnotations = (project.circuit.annotations || []).filter(a => a.sheetId === circuitState.activeSheetId);
      circuitState.setSelectedAnnotationIds(sheetAnnotations.map(a => a.id));
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
    const mouseX = snapToGrid(interaction.mouseWorldPos.x);
    const mouseY = snapToGrid(interaction.mouseWorldPos.y);

    // Annotation ghost — render shapes with correct offsets
    if (cb.annotations && cb.annotations.length > 0 && cb.devices.length === 0) {
      const ref = cb.annotations[0];
      const offsetX = mouseX - ref.position.x;
      const offsetY = mouseY - ref.position.y;
      return cb.annotations.map(ann => {
        const s = ann.style || {};
        // For line/arrow, offset endX/endY too
        const offsetStyle = (ann.annotationType === 'line' || ann.annotationType === 'arrow')
          ? { ...s, endX: (s.endX ?? ann.position.x + 10) + offsetX, endY: (s.endY ?? ann.position.y) + offsetY }
          : s;
        return {
          category: '_annotation_shape_',
          x: ann.position.x + offsetX,
          y: ann.position.y + offsetY,
          tag: ann.content || ann.annotationType,
          annotationType: ann.annotationType,
          style: offsetStyle,
        };
      });
    }

    // Device ghost
    if (cb.positions.size === 0) return null;
    let cx = 0, cy = 0;
    for (const pos of cb.positions.values()) { cx += pos.x; cy += pos.y; }
    cx /= cb.positions.size;
    cy /= cb.positions.size;

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
            showDescriptions: circuitState.showDescriptions,
            showPinLabels: circuitState.showPinLabels,
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
            showDescriptions: circuitState.showDescriptions,
            showPinLabels: circuitState.showPinLabels,
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
        shapeToolType={interaction.shapeToolType}
        setShapeToolType={interaction.setShapeToolType}
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
        onImportImage={() => imageInputRef.current?.click()}
        // Tools
        onOpenAIGenerate={() => setShowAIPrompt(true)}
        onOpenERC={() => setShowERC(true)}
        onOpenSymbolEditor={() => setEditSymbolId('_create_new_')}
        onOpenSymbolImport={() => setShowSymbolImport(true)}
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
          onReorderSheets={circuitState.reorderSheets}
          activeSheet={circuitState.sheets.find(s => s.id === circuitState.activeSheetId) || null}
          onUpdateSheet={circuitState.updateSheet}
          sheetLayout={circuitState.getSheetLayout(circuitState.activeSheetId)}
          onSetSheetLayout={circuitState.setSheetLayout}
          rungSpacing={circuitState.getRungSpacing(circuitState.activeSheetId)}
          onSetRungSpacing={(spacing: number) => circuitState.setRungSpacing(circuitState.activeSheetId, spacing)}
          showGrid={circuitState.showGrid}
          setShowGrid={circuitState.setShowGrid}
          showPinLabels={circuitState.showPinLabels}
          setShowPinLabels={circuitState.setShowPinLabels}
          showDescriptions={circuitState.showDescriptions}
          setShowDescriptions={circuitState.setShowDescriptions}
          sheetScale={circuitState.getPanelScale(circuitState.activeSheetId)}
          onSetSheetScale={(scale: number) => circuitState.setPanelScale(circuitState.activeSheetId, scale)}
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
            wireWaypoints={interaction.wireWaypoints}
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
            selectedAnnotationIds={circuitState.selectedAnnotationIds}
            sheetConnections={interaction.sheetConnections}
            renderHandleRef={interaction.renderHandleRef}
            onEditSymbol={(symbolKey) => setEditSymbolId(symbolKey)}
            alignSelectedDevices={circuitState.alignSelectedDevices}
            ghostPaste={ghostPaste}
            drawingShapePreview={interaction.drawingShapePreview}
            showGrid={circuitState.showGrid}
            showPinLabels={circuitState.showPinLabels}
            showDescriptions={circuitState.showDescriptions}
          />

          {/* Inline text input for annotations */}
          {interaction.pendingTextPosition && (() => {
            const mmScale = interaction.viewport.scale * 4; // MM_TO_PX = 4
            const screenX = interaction.pendingTextPosition.x * mmScale + interaction.viewport.offsetX;
            const screenY = interaction.pendingTextPosition.y * mmScale + interaction.viewport.offsetY;
            return (
              <textarea
                autoFocus
                placeholder="Type text... (Enter to place, Alt+Enter for new line)"
                style={{
                  position: 'absolute',
                  left: screenX,
                  top: screenY,
                  minWidth: '150px',
                  minHeight: '40px',
                  maxWidth: '300px',
                  padding: '4px 6px',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  background: 'var(--fc-bg-app)',
                  color: 'var(--fc-text-primary)',
                  border: '1px solid var(--fc-accent)',
                  borderRadius: '3px',
                  outline: 'none',
                  resize: 'both',
                  zIndex: 100,
                }}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    interaction.setPendingTextPosition(null);
                  }
                  // Enter = submit (place text)
                  // Alt+Enter or Cmd+Enter = new line
                  if (e.key === 'Enter') {
                    if (e.altKey || e.ctrlKey || e.metaKey) {
                      // Allow new line — don't prevent default
                    } else {
                      e.preventDefault();
                      const text = (e.target as HTMLTextAreaElement).value.trim();
                      if (text) {
                        circuitState.addAnnotation(
                          interaction.pendingTextPosition!.x,
                          interaction.pendingTextPosition!.y,
                          text
                        );
                      }
                      interaction.setPendingTextPosition(null);
                    }
                  }
                }}
                onBlur={e => {
                  const text = e.target.value.trim();
                  if (text) {
                    circuitState.addAnnotation(
                      interaction.pendingTextPosition!.x,
                      interaction.pendingTextPosition!.y,
                      text
                    );
                  }
                  interaction.setPendingTextPosition(null);
                }}
              />
            );
          })()}

          {/* Edit existing annotation (F2) */}
          {interaction.editingAnnotationId && (() => {
            const ann = (project.circuit?.annotations || []).find(a => a.id === interaction.editingAnnotationId);
            if (!ann) return null;
            const mmScale = interaction.viewport.scale * 4;
            const screenX = ann.position.x * mmScale + interaction.viewport.offsetX;
            const screenY = ann.position.y * mmScale + interaction.viewport.offsetY;
            return (
              <textarea
                autoFocus
                defaultValue={ann.content}
                style={{
                  position: 'absolute',
                  left: screenX,
                  top: screenY,
                  minWidth: '150px',
                  minHeight: '40px',
                  maxWidth: '300px',
                  padding: '4px 6px',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  background: 'var(--fc-bg-app)',
                  color: 'var(--fc-text-primary)',
                  border: '1px solid var(--fc-accent)',
                  borderRadius: '3px',
                  outline: 'none',
                  resize: 'both',
                  zIndex: 100,
                }}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    interaction.setEditingAnnotationId(null);
                  }
                  if (e.key === 'Enter' && !e.altKey && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    const text = (e.target as HTMLTextAreaElement).value.trim();
                    if (text) {
                      circuitState.updateAnnotation(ann.id, { content: text });
                    }
                    interaction.setEditingAnnotationId(null);
                  }
                }}
                onBlur={e => {
                  const text = e.target.value.trim();
                  if (text) {
                    circuitState.updateAnnotation(ann.id, { content: text });
                  }
                  interaction.setEditingAnnotationId(null);
                }}
              />
            );
          })()}

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
          sheetContext={circuitState.getSheetLayout(circuitState.activeSheetId) === 'panel-layout' ? 'panel-layout' : 'schematic'}
          symbolLibVersion={symbolLibVersion}
          wireStart={interaction.wireStart}
          selectedDevices={circuitState.selectedDevices}
          selectedWireIndex={circuitState.selectedWireIndex}
          circuit={project.circuit}
          deleteDevices={circuitState.deleteDevices}
          onSelectDevices={circuitState.setSelectedDevices}
          updateWireNumber={circuitState.updateWireNumber}
          updateWireField={circuitState.updateWireField}
          onAssignPart={circuitState.assignPart}
          onUpdateDevice={circuitState.updateDevice}
          onToggleDashed={circuitState.toggleDashed}
          selectedAnnotationIds={circuitState.selectedAnnotationIds}
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

      {showSymbolImport && (
        <SymbolImportDialog
          onClose={() => setShowSymbolImport(false)}
          onSymbolRegistered={() => setSymbolLibVersion(v => v + 1)}
          onAddToProject={(sym) => {
            project.setCircuit(prev => {
              if (!prev) return prev;
              const existing = prev.symbols || [];
              // Replace if same ID exists
              const filtered = existing.filter(s => s.id !== sym.id);
              return { ...prev, symbols: [...filtered, sym] };
            });
          }}
        />
      )}

      {showFindReplace && (
        <FindReplaceDialog
          circuit={project.circuit}
          onClose={() => setShowFindReplace(false)}
          onUpdateDevice={circuitState.updateDevice}
          onSelectDevices={circuitState.setSelectedDevices}
          activeSheetId={circuitState.activeSheetId}
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

      {/* Hidden file input for image import */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/bmp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImageFile(file);
          e.target.value = ''; // reset so same file can be re-selected
        }}
      />

      {/* Pending image placement banner */}
      {pendingImage && (
        <div style={{
          position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--surface-2, #333)', color: 'var(--text-1, #fff)',
          padding: '8px 16px', borderRadius: 6, zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 13,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          Click on the canvas to place the image
          <button
            onClick={() => setPendingImage(null)}
            style={{ background: 'none', border: '1px solid #666', color: 'inherit', padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
