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
import { RoutePreviewPanel } from './components/RoutePreviewPanel';
import { NodeEditPanel } from './components/NodeEditPanel';
import { Point } from './types';

const params = new URLSearchParams(window.location.search);
const FLOOR_ID    = Number(params.get('floor_id'))  || null;
const PLAN_ID     = Number(params.get('plan_id'))   || null;
const VIEW_SELECT = params.get('view') === 'select';

// Minimal tree types for breadcrumb dropdown
interface TreeFloor    { id: number; name: string; sort_order?: number; }
interface TreeStruct   { id: number; name: string; floors: TreeFloor[]; }
interface TreeBuilding { id: number; name: string; structures: TreeStruct[]; }
interface TreeCampus   { id: number; name: string; buildings: TreeBuilding[]; }

function App() {
  const { realWidth, realHeight, resolution, loadFromServer, setFloorName, setPlanId: setStorePlanId } = useEditorStore();
  const svgWidth  = realWidth  * resolution;
  const svgHeight = realHeight * resolution;

  const [planId, setPlanId]           = useState<number | null>(PLAN_ID);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [tree, setTree]               = useState<TreeCampus[]>([]);
  const [editingCrumb, setEditingCrumb] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const [hoveredCrumb, setHoveredCrumb] = useState<number | null>(null);
  const [showCrossFloor, setShowCrossFloor] = useState(false);
  const [showRoutePreview, setShowRoutePreview] = useState(false);
  const [routeOverlay, setRouteOverlay] = useState<any>(null);
  const [editingNode, setEditingNode] = useState<Point | null>(null);

  // Pan state
  const [pan, setPan]     = useState({ x: 20, y: 20 });
  const [altHeld, setAltHeld] = useState(false);
  const isPanning  = useRef(false);
  const panOrigin  = useRef({ mx: 0, my: 0, px: 0, py: 0 });

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

  // ── Breadcrumb helpers ───────────────────────────────────────────────────────

  function getSiblings(i: number): Array<{ id: number; name: string }> {
    if (!tree.length || !breadcrumbs.length) return [];
    const campus   = tree.find(c => c.id === breadcrumbs[0]?.id);
    const building = campus?.buildings.find(b => b.id === breadcrumbs[1]?.id);
    const struct_  = building?.structures.find(s => s.id === breadcrumbs[2]?.id);
    switch (i) {
      case 0: return tree;
      case 1: return campus?.buildings ?? [];
      case 2: return building?.structures ?? [];
      case 3: return (struct_?.floors ?? [])
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      default: return [];
    }
  }

  function navigateSibling(i: number, id: number) {
    if (i === 3) {
      window.location.href = `?floor_id=${id}`;
      return;
    }
    const p = new URLSearchParams({ view: 'select' });
    if (i === 0) { p.set('campus_id', String(id)); }
    if (i === 1) { p.set('campus_id', String(breadcrumbs[0].id)); p.set('building_id', String(id)); }
    if (i === 2) { p.set('campus_id', String(breadcrumbs[0].id)); p.set('building_id', String(breadcrumbs[1].id)); p.set('structure_id', String(id)); }
    window.location.href = `?${p.toString()}`;
  }

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

        {/* ── Breadcrumbs with dropdown navigation ── */}
        {breadcrumbs.length > 0 && (
          <span style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: 4 }}>
            {breadcrumbs.map((crumb, i) => {
              const siblings = getSiblings(i);
              const isLast   = i === breadcrumbs.length - 1;
              const isOpen   = openDropdown === i;
              const isHover  = hoveredCrumb === i;

              return (
                <React.Fragment key={crumb.id}>
                  {i > 0 && <span style={{ color: '#D1D5DB' }}>›</span>}

                  <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 2 }}>

                    {editingCrumb === i ? (
                      /* ── Inline rename input ── */
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
                          fontSize: 13, fontWeight: isLast ? 600 : 400,
                          border: 'none', borderBottom: '1px solid #2563EB', outline: 'none',
                          background: 'transparent', color: '#111827', padding: '0 2px',
                          width: `${Math.max(editingValue.length, 4)}ch`,
                        }}
                      />
                    ) : (
                      /* ── Crumb label + pencil ── */
                      <span
                        onMouseEnter={() => setHoveredCrumb(i)}
                        onMouseLeave={() => setHoveredCrumb(null)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}
                      >
                        <button
                          onClick={() => siblings.length > 1 && setOpenDropdown(isOpen ? null : i)}
                          style={{
                            background: 'none', border: 'none', padding: '2px 4px', borderRadius: 4,
                            cursor: siblings.length > 1 ? 'pointer' : 'default',
                            color: isLast ? '#111827' : '#6B7280',
                            fontWeight: isLast ? 600 : 400,
                            fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 3,
                            transition: 'background 0.1s',
                            ...(isHover && siblings.length > 1 ? { background: '#F3F4F6' } : {}),
                          }}
                        >
                          {crumb.name}
                          {siblings.length > 1 && (
                            <span style={{ fontSize: 8, color: '#9CA3AF', lineHeight: 1, marginTop: 1 }}>▾</span>
                          )}
                        </button>

                        {/* Pencil rename button */}
                        <button
                          onClick={() => { setEditingCrumb(i); setEditingValue(crumb.name); setOpenDropdown(null); }}
                          title="Переименовать"
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            padding: '1px 3px', borderRadius: 3, fontSize: 11, lineHeight: 1,
                            color: '#9CA3AF', opacity: isHover ? 1 : 0,
                            pointerEvents: isHover ? 'auto' : 'none',
                            transition: 'opacity 0.15s',
                          }}
                        >
                          ✏️
                        </button>
                      </span>
                    )}

                    {/* ── Dropdown ── */}
                    {isOpen && siblings.length > 1 && (
                      <>
                        {/* Invisible overlay to close on outside click */}
                        <div
                          style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                          onClick={() => setOpenDropdown(null)}
                        />
                        <div style={{
                          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 1000,
                          background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8,
                          boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                          minWidth: 180, maxHeight: 280, overflowY: 'auto',
                          padding: '4px 0',
                        }}>
                          {siblings.map(s => (
                            <button
                              key={s.id}
                              onClick={() => { setOpenDropdown(null); if (s.id !== crumb.id) navigateSibling(i, s.id); }}
                              style={{
                                display: 'block', width: '100%', textAlign: 'left',
                                padding: '7px 14px', border: 'none',
                                background: s.id === crumb.id ? '#EFF6FF' : 'transparent',
                                color: s.id === crumb.id ? '#2563EB' : '#111827',
                                fontWeight: s.id === crumb.id ? 600 : 400,
                                fontSize: 13, cursor: s.id === crumb.id ? 'default' : 'pointer',
                              }}
                              onMouseEnter={e => { if (s.id !== crumb.id) (e.currentTarget.style.background = '#F9FAFB'); }}
                              onMouseLeave={e => { e.currentTarget.style.background = s.id === crumb.id ? '#EFF6FF' : 'transparent'; }}
                            >
                              {s.name}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </span>
                </React.Fragment>
              );
            })}
          </span>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Route preview button */}
        <button
          onClick={() => setShowRoutePreview(v => !v)}
          style={{
            padding: '4px 10px', border: '1px solid #D1D5DB', borderRadius: 6,
            background: showRoutePreview ? '#EFF6FF' : '#fff',
            color: showRoutePreview ? '#2563EB' : '#374151',
            fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
          title="Проверить маршрут"
        >
          ⬡ Маршрут
        </button>

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
          ↕ Вертикали
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
            <SVGCanvas routeOverlay={routeOverlay} onNodeEdit={setEditingNode} />
            {editingNode && (
              <NodeEditPanel point={editingNode} onClose={() => setEditingNode(null)} />
            )}
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
