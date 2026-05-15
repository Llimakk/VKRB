import React, { useEffect, useRef, useState } from 'react';
import { useEditorStore } from './store/editorStore';
import { SVGCanvas } from './components/SVGCanvas';
import { ModeSelector } from './components/ModeSelector';
import { Controls } from './components/Controls';
import { ImageUpload } from './components/ImageUpload';
import { Settings } from './components/Settings';
import { Breadcrumbs } from './components/Breadcrumbs';
import { getOrCreateFloorPlan, loadPlanGraph, getPlansTree, findBreadcrumb, Breadcrumb, TreeCampus } from './api';
import { PolygonBindDialog } from './components/PolygonBindDialog';
import { PolygonEditDialog } from './components/PolygonEditDialog';
import { LandingPage } from './components/LandingPage';
import { CrossFloorPanel } from './components/CrossFloorPanel';
import { RoutePreviewPanel } from './components/RoutePreviewPanel';
import { NodeEditPanel } from './components/NodeEditPanel';
import { ValidationPanel, countValidationIssues } from './components/ValidationPanel';
import { Point } from './types';

const params = new URLSearchParams(window.location.search);
const FLOOR_ID    = Number(params.get('floor_id'))  || null;
const PLAN_ID     = Number(params.get('plan_id'))   || null;
const VIEW_SELECT = params.get('view') === 'select';

function App() {
  const { realWidth, realHeight, resolution, loadFromServer, setFloorName, setPlanId: setStorePlanId, points, connections, polygons } = useEditorStore();
  const issuesCount = countValidationIssues(points, connections, polygons);
  const svgWidth  = realWidth  * resolution;
  const svgHeight = realHeight * resolution;

  const [planId, setPlanId]           = useState<number | null>(PLAN_ID);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [tree, setTree]               = useState<TreeCampus[]>([]);
  const [showCrossFloor, setShowCrossFloor] = useState(false);
  const [showRoutePreview, setShowRoutePreview] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [routeOverlay, setRouteOverlay] = useState<any>(null);
  const [editingNode, setEditingNode] = useState<Point | null>(null);
  const [showRightPanel, setShowRightPanel] = useState(true);

  // Pan / zoom state
  const [pan, setPan]     = useState({ x: 20, y: 20 });
  const [zoom, setZoom]   = useState(1);
  const [altHeld, setAltHeld] = useState(false);
  const isPanning  = useRef(false);
  const panOrigin  = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const ZOOM_MIN = 0.1;
  const ZOOM_MAX = 4;

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Alt') { e.preventDefault(); setAltHeld(true); } };
    const up   = (e: KeyboardEvent) => { if (e.key === 'Alt') { setAltHeld(false); isPanning.current = false; } };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup',   up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(FLOOR_ID !== null);

  useEffect(() => {
    if (!FLOOR_ID) return;
    (async () => {
      try {
        const [meta, treeData] = await Promise.all([
          getOrCreateFloorPlan(FLOOR_ID),
          getPlansTree(),
        ]);
        setPlanId(meta.id);
        setStorePlanId(meta.id);
        setFloorName(meta.title);
        setTree(treeData as unknown as TreeCampus[]);
        const crumbs = findBreadcrumb(treeData, FLOOR_ID);
        if (crumbs) setBreadcrumbs(crumbs);
        const graph = await loadPlanGraph(meta.id);
        loadFromServer(graph);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', color: '#6B7280' }}>
        Загрузка плана этажа…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', color: '#DC2626' }}>
        Ошибка: {error}
      </div>
    );
  }

  if (!planId || VIEW_SELECT) {
    return <LandingPage />;
  }

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      background: '#F3F4F6',
    }}>

      {/* ── Header ── */}
      <header style={{
        height: '48px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        background: '#FFFFFF',
        borderBottom: '1px solid #E5E7EB',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        zIndex: 10,
        gap: '8px',
      }}>
        <Controls planId={planId} />

        <Breadcrumbs breadcrumbs={breadcrumbs} tree={tree} onChange={setBreadcrumbs} />

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Route preview toggle */}
        <button
          onClick={() => setShowRoutePreview(v => !v)}
          title="Проверить маршрут"
          style={{
            height: 30, padding: '0 10px', borderRadius: 5, cursor: 'pointer',
            border: `1px solid ${showRoutePreview ? '#BFDBFE' : '#D1D5DB'}`,
            background: showRoutePreview ? '#EFF6FF' : '#fff',
            color: showRoutePreview ? '#2563EB' : '#374151',
            fontSize: 12, fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="2.5" cy="11" r="1.8" fill="currentColor" />
            <circle cx="11.5" cy="3" r="1.8" fill="currentColor" />
            <path d="M4 10.5 Q4 7 7.5 7 Q11 7 11 4.5"
              stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
          </svg>
          Маршрут
        </button>

        {/* Validation */}
        <button
          onClick={() => setShowValidation(v => !v)}
          title="Проверка плана на ошибки"
          style={{
            height: 30, padding: '0 10px', borderRadius: 5, cursor: 'pointer',
            border: `1px solid ${showValidation ? '#BFDBFE' : '#D1D5DB'}`,
            background: showValidation ? '#EFF6FF' : '#fff',
            color: showValidation ? '#2563EB' : '#374151',
            fontSize: 12, fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
            position: 'relative',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1L1.5 3v3.5c0 3 2.5 5.5 5.5 6.5 3-1 5.5-3.5 5.5-6.5V3L7 1z"
              stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
            <path d="M5 7l1.5 1.5L9 6" stroke="currentColor" strokeWidth="1.4"
              strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          Проверка
          {issuesCount > 0 && (
            <span style={{
              minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999,
              background: '#DC2626', color: '#fff', fontSize: 10, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              marginLeft: 2,
            }}>
              {issuesCount}
            </span>
          )}
        </button>

        {/* Cross-floor connections */}
        <button
          onClick={() => setShowCrossFloor(true)}
          title="Управление межэтажными связями"
          style={{
            height: 30, padding: '0 10px', borderRadius: 5, cursor: 'pointer',
            border: '1px solid #D1D5DB', background: '#fff', color: '#374151',
            fontSize: 12, fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M4.5 3.5L7 1l2.5 2.5M4.5 10.5L7 13l2.5-2.5"
              stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Вертикали
        </button>

        {/* Canvas meta — compact: plan id · real dimensions · resolution */}
        <span
          title={`Холст: ${svgWidth.toFixed(0)} × ${svgHeight.toFixed(0)} px`}
          style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap', userSelect: 'none' }}
        >
          #{planId}&nbsp;·&nbsp;{realWidth}×{realHeight}&nbsp;м&nbsp;·&nbsp;{resolution}&nbsp;px/м
        </span>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left toolbar */}
        <aside style={{
          width: '88px',
          flexShrink: 0,
          background: '#FFFFFF',
          borderRight: '1px solid #E5E7EB',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          padding: '6px 0',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}>
          <ModeSelector />
        </aside>

        <PolygonBindDialog />
        <PolygonEditDialog />
        {showCrossFloor && <CrossFloorPanel onClose={() => setShowCrossFloor(false)} />}
        {showRoutePreview && planId && (
          <RoutePreviewPanel
            currentPlanId={planId}
            onRouteChange={setRouteOverlay}
            onClose={() => { setShowRoutePreview(false); setRouteOverlay(null); }}
          />
        )}
        {showValidation && (
          <ValidationPanel
            onClose={() => setShowValidation(false)}
            onFocus={(t) => setPan({ x: -t.x + window.innerWidth / 2 - 88, y: -t.y + window.innerHeight / 2 })}
          />
        )}

        {/* Canvas area */}
        <main
          style={{
            flex: 1,
            overflow: 'hidden',
            background: '#F3F4F6',
            position: 'relative',
            cursor: altHeld ? 'grab' : undefined,
          }}
          onMouseDown={e => {
            if (!e.altKey) return;
            e.preventDefault();
            isPanning.current = true;
            panOrigin.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
          }}
          onMouseMove={e => {
            if (!isPanning.current) return;
            setPan({
              x: panOrigin.current.px + (e.clientX - panOrigin.current.mx),
              y: panOrigin.current.py + (e.clientY - panOrigin.current.my),
            });
          }}
          onMouseUp={() => { isPanning.current = false; }}
          onMouseLeave={() => { isPanning.current = false; }}
          onWheel={e => {
            // Plain wheel scroll = scroll page; Ctrl/Cmd + wheel = zoom to cursor.
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const cursorX = e.clientX - rect.left;
            const cursorY = e.clientY - rect.top;
            const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
            const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * factor));
            if (newZoom === zoom) return;
            // Keep the world point under the cursor fixed:
            //   worldUnderCursor = (cursor - pan) / zoom
            //   pan' = cursor - worldUnderCursor * newZoom
            const worldX = (cursorX - pan.x) / zoom;
            const worldY = (cursorY - pan.y) / zoom;
            setPan({ x: cursorX - worldX * newZoom, y: cursorY - worldY * newZoom });
            setZoom(newZoom);
          }}
        >
          <div style={{
            position: 'absolute',
            transformOrigin: '0 0',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            pointerEvents: altHeld ? 'none' : 'auto',
          }}>
            <SVGCanvas routeOverlay={routeOverlay} onNodeEdit={setEditingNode} />
            {editingNode && (
              <NodeEditPanel point={editingNode} onClose={() => setEditingNode(null)} />
            )}
          </div>

          {/* Zoom controls */}
          <div style={{
            position: 'absolute', bottom: 12, right: 12, zIndex: 400,
            display: 'flex', alignItems: 'center', gap: 4,
            background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)', padding: 4,
          }}>
            <button
              onClick={() => {
                const newZoom = Math.max(ZOOM_MIN, zoom / 1.2);
                setZoom(newZoom);
              }}
              title="Уменьшить"
              style={{ width: 26, height: 26, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, color: '#374151', borderRadius: 4 }}
            >−</button>
            <button
              onClick={() => { setPan({ x: 20, y: 20 }); setZoom(1); }}
              title="Сбросить вид"
              style={{ minWidth: 46, height: 26, padding: '0 6px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 11, color: '#6B7280', borderRadius: 4, fontVariantNumeric: 'tabular-nums' }}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => {
                const newZoom = Math.min(ZOOM_MAX, zoom * 1.2);
                setZoom(newZoom);
              }}
              title="Увеличить"
              style={{ width: 26, height: 26, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, color: '#374151', borderRadius: 4 }}
            >+</button>
          </div>
        </main>

        {/* Right panel */}
        <aside style={{
          width: showRightPanel ? 248 : 16,
          flexShrink: 0,
          background: '#FFFFFF',
          borderLeft: '1px solid #E5E7EB',
          display: 'flex',
          flexDirection: 'row',
          transition: 'width 0.2s ease',
          overflowX: 'hidden',
        }}>
          {/* Toggle strip */}
          <div
            onClick={() => setShowRightPanel(v => !v)}
            title={showRightPanel ? 'Скрыть панель' : 'Показать панель'}
            style={{
              width: 16,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              borderRight: showRightPanel ? '1px solid #E5E7EB' : 'none',
              color: '#9CA3AF',
              userSelect: 'none',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.color = '#374151'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.color = '#9CA3AF'; }}
          >
            <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
              {showRightPanel
                ? <path d="M6 2L2 7l4 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                : <path d="M2 2l4 5-4 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              }
            </svg>
          </div>

          {/* Content */}
          {showRightPanel && (
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <ImageUpload planId={planId} />
              <Settings />
            </div>
          )}
        </aside>

      </div>
    </div>
  );
}

export default App;
