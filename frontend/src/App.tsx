import React, { useEffect, useRef, useState } from 'react';
import { useEditorStore } from './store/editorStore';
import { SVGCanvas } from './components/SVGCanvas';
import { ModeSelector } from './components/ModeSelector';
import { Controls } from './components/Controls';
import { ImageUpload } from './components/ImageUpload';
import { Settings } from './components/Settings';
import { getOrCreateFloorPlan, loadPlanGraph, getPlansTree, findBreadcrumb, renameBreadcrumb, Breadcrumb } from './api';
import { PolygonBindDialog } from './components/PolygonBindDialog';
import { PolygonEditDialog } from './components/PolygonEditDialog';
import { LandingPage } from './components/LandingPage';
import { CrossFloorPanel } from './components/CrossFloorPanel';

const params = new URLSearchParams(window.location.search);
const FLOOR_ID   = Number(params.get('floor_id')) || null;
const PLAN_ID    = Number(params.get('plan_id'))  || null;
const VIEW_SELECT = params.get('view') === 'select';

function App() {
  const { realWidth, realHeight, resolution, loadFromServer, setFloorName, setPlanId: setStorePlanId } = useEditorStore();
  const svgWidth  = realWidth  * resolution;
  const svgHeight = realHeight * resolution;

  const [planId, setPlanId] = useState<number | null>(PLAN_ID);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [editingCrumb, setEditingCrumb] = useState<number | null>(null); // index
  const [editingValue, setEditingValue] = useState('');
  const [showCrossFloor, setShowCrossFloor] = useState(false);

  // Pan state
  const [pan, setPan] = useState({ x: 20, y: 20 });
  const [altHeld, setAltHeld] = useState(false);
  const isPanning = useRef(false);
  const panOrigin = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Alt') { e.preventDefault(); setAltHeld(true); } };
    const up   = (e: KeyboardEvent) => { if (e.key === 'Alt') { setAltHeld(false); isPanning.current = false; } };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(FLOOR_ID !== null);

  // On mount: if floor_id is given, resolve (or create) plan and auto-load graph
  useEffect(() => {
    if (!FLOOR_ID) return;
    (async () => {
      try {
        const [meta, tree] = await Promise.all([
          getOrCreateFloorPlan(FLOOR_ID),
          getPlansTree(),
        ]);
        setPlanId(meta.id);
        setStorePlanId(meta.id);
        setFloorName(meta.title);
        const crumbs = findBreadcrumb(tree, FLOOR_ID);
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

        {/* Breadcrumbs */}
        {breadcrumbs.length > 0 && (
          <span style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: 4 }}>
            {breadcrumbs.map((crumb, i) => (
              <React.Fragment key={crumb.id}>
                {i > 0 && <span style={{ color: '#D1D5DB' }}>›</span>}
                {editingCrumb === i ? (
                  <input
                    autoFocus
                    value={editingValue}
                    onChange={e => setEditingValue(e.target.value)}
                    onKeyDown={async e => {
                      if (e.key === 'Enter') {
                        const name = editingValue.trim();
                        if (name && name !== crumb.name) {
                          await renameBreadcrumb(crumb.level, crumb.id, name);
                          setBreadcrumbs(prev => prev.map((c, j) => j === i ? { ...c, name } : c));
                        }
                        setEditingCrumb(null);
                      } else if (e.key === 'Escape') {
                        setEditingCrumb(null);
                      }
                    }}
                    onBlur={async () => {
                      const name = editingValue.trim();
                      if (name && name !== crumb.name) {
                        await renameBreadcrumb(crumb.level, crumb.id, name);
                        setBreadcrumbs(prev => prev.map((c, j) => j === i ? { ...c, name } : c));
                      }
                      setEditingCrumb(null);
                    }}
                    style={{
                      fontSize: 13, fontWeight: i === breadcrumbs.length - 1 ? 600 : 400,
                      border: 'none', borderBottom: '1px solid #2563EB', outline: 'none',
                      background: 'transparent', color: '#111827', padding: '0 2px', width: `${Math.max(editingValue.length, 4)}ch`,
                    }}
                  />
                ) : (
                  <span
                    title="Нажмите для редактирования"
                    onClick={() => { setEditingCrumb(i); setEditingValue(crumb.name); }}
                    style={{
                      color: i === breadcrumbs.length - 1 ? '#111827' : '#6B7280',
                      fontWeight: i === breadcrumbs.length - 1 ? 600 : 400,
                      cursor: 'pointer', borderRadius: 3, padding: '1px 3px',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F3F4F6')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {crumb.name}
                  </span>
                )}
              </React.Fragment>
            ))}
          </span>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Cross-floor button */}
        <button
          onClick={() => setShowCrossFloor(true)}
          style={{
            padding: '4px 10px', border: '1px solid #D1D5DB', borderRadius: 6,
            background: '#fff', color: '#374151', fontSize: 12, cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          title="Управление межэтажными связями"
        >
          ↕ Межэтажные
        </button>

        {/* Canvas size info */}
        <span style={{ fontSize: '12px', color: '#9CA3AF', whiteSpace: 'nowrap' }}>
          план&nbsp;#{planId}
          &nbsp;·&nbsp;
          {svgWidth.toFixed(0)} × {svgHeight.toFixed(0)} px
          &nbsp;·&nbsp;
          {realWidth} × {realHeight} м
          &nbsp;·&nbsp;
          {resolution} px/м
        </span>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left toolbar */}
        <aside style={{
          width: '64px',
          flexShrink: 0,
          background: '#FFFFFF',
          borderRight: '1px solid #E5E7EB',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '6px 0',
          overflowY: 'auto',
        }}>
          <ModeSelector />
        </aside>

        {/* Polygon binding dialog (new polygon) */}
        <PolygonBindDialog />
        {/* Polygon edit dialog (existing polygon) */}
        <PolygonEditDialog />
        {/* Cross-floor edge management */}
        {showCrossFloor && <CrossFloorPanel onClose={() => setShowCrossFloor(false)} />}

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
        >
          <div style={{
            position: 'absolute',
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            pointerEvents: altHeld ? 'none' : 'auto',
          }}>
            <SVGCanvas />
          </div>
        </main>

        {/* Right panel */}
        <aside style={{
          width: '248px',
          flexShrink: 0,
          background: '#FFFFFF',
          borderLeft: '1px solid #E5E7EB',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <ImageUpload planId={planId} />
          <Settings />
        </aside>

      </div>
    </div>
  );
}

export default App;
