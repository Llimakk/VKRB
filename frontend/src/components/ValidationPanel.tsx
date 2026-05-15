import React, { useMemo } from 'react';
import { useEditorStore } from '../store/editorStore';
import { HEADER_HEIGHT } from '../constants';
import { Point, Polygon } from '../types';

type Severity = 'error' | 'warn';

interface Issue {
  id: string;                       // stable key for React
  severity: Severity;
  message: string;
  target?: { x: number; y: number }; // canvas focus point
}

const SEVERITY_STYLE: Record<Severity, { bg: string; border: string; color: string; icon: string }> = {
  error: { bg: '#FEF2F2', border: '#FECACA', color: '#B91C1C', icon: '✕' },
  warn:  { bg: '#FFFBEB', border: '#FDE68A', color: '#92400E', icon: '!' },
};

function polygonCentroid(p: Polygon): { x: number; y: number } | undefined {
  if (p.points.length === 0) return undefined;
  const x = p.points.reduce((s, pt) => s + pt.x, 0) / p.points.length;
  const y = p.points.reduce((s, pt) => s + pt.y, 0) / p.points.length;
  return { x, y };
}

function runValidation(
  points: Point[],
  connections: { from_id: string; to_id: string }[],
  polygons: Polygon[],
): Issue[] {
  const issues: Issue[] = [];

  // 1. Polygons with no entry node
  polygons.forEach((poly, idx) => {
    if (poly.points.length === 0) return; // virtual passage polygon — skip
    if (!poly.nav_node_client_ids || poly.nav_node_client_ids.length === 0) {
      issues.push({
        id: `poly-no-entry-${idx}`,
        severity: 'warn',
        message: `Полигон «${poly.name || `#${idx + 1}`}» без точки входа`,
        target: polygonCentroid(poly),
      });
    }
  });

  // 2. Polygons referencing non-existent entry node id
  polygons.forEach((poly, idx) => {
    const missing = (poly.nav_node_client_ids ?? []).filter(
      id => !points.some(p => p.id === id),
    );
    if (missing.length) {
      issues.push({
        id: `poly-broken-entry-${idx}`,
        severity: 'error',
        message: `Полигон «${poly.name || `#${idx + 1}`}» ссылается на удалённые узлы (${missing.length})`,
        target: polygonCentroid(poly),
      });
    }
  });

  // 3. nav-nodes that don't participate in any edge
  const connectedIds = new Set<string>();
  for (const c of connections) {
    connectedIds.add(c.from_id);
    connectedIds.add(c.to_id);
  }
  points.forEach(pt => {
    if (pt.node_type === 'passage') return; // passage uses virtual cross-floor edges
    if (!connectedIds.has(pt.id)) {
      issues.push({
        id: `node-isolated-${pt.id}`,
        severity: 'warn',
        message: `Узел «${pt.name || pt.node_type}» не подключён ни к одному ребру`,
        target: { x: pt.x, y: pt.y },
      });
    }
  });

  // 4. exit nodes without GPS coordinates
  points.forEach(pt => {
    if (pt.node_type !== 'exit') return;
    if (pt.lat == null || pt.lon == null) {
      issues.push({
        id: `exit-no-gps-${pt.id}`,
        severity: 'warn',
        message: `Выход «${pt.name || ''}» без GPS-координат`,
        target: { x: pt.x, y: pt.y },
      });
    }
  });

  // 5. duplicate node names within same type on this plan
  // Skip if all duplicates are entry nodes of the same polygon (multi-entrance room).
  const nodeIdToPolygons = new Map<string, Set<number>>();
  polygons.forEach((poly, idx) => {
    for (const nid of poly.nav_node_client_ids ?? []) {
      const set = nodeIdToPolygons.get(nid) ?? new Set();
      set.add(idx);
      nodeIdToPolygons.set(nid, set);
    }
  });

  const nameKey = (p: Point) => `${p.node_type}::${(p.name || '').trim().toLowerCase()}`;
  const nameCounts = new Map<string, Point[]>();
  for (const pt of points) {
    if (!pt.name?.trim()) continue;
    const k = nameKey(pt);
    const arr = nameCounts.get(k) ?? [];
    arr.push(pt);
    nameCounts.set(k, arr);
  }
  nameCounts.forEach((pts, key) => {
    if (pts.length <= 1) return;
    // All bound to the same polygon? Then it's an expected multi-entrance setup.
    const polySetsPerNode = pts.map(p => nodeIdToPolygons.get(p.id) ?? new Set<number>());
    const shared = polySetsPerNode.reduce<Set<number> | null>(
      (acc, s) => acc === null ? new Set(s) : new Set([...acc].filter(x => s.has(x))),
      null,
    );
    if (shared && shared.size > 0) return;

    const [type] = key.split('::');
    issues.push({
      id: `dup-name-${key}`,
      severity: 'warn',
      message: `Дублирующееся имя «${pts[0].name}» (${type}, ×${pts.length})`,
      target: { x: pts[0].x, y: pts[0].y },
    });
  });

  return issues;
}

interface Props {
  onClose: () => void;
  onFocus?: (target: { x: number; y: number }) => void;
}

export const ValidationPanel: React.FC<Props> = ({ onClose, onFocus }) => {
  const { points, connections, polygons } = useEditorStore();

  const issues = useMemo(
    () => runValidation(points, connections, polygons),
    [points, connections, polygons],
  );

  const errors = issues.filter(i => i.severity === 'error').length;
  const warns  = issues.filter(i => i.severity === 'warn').length;

  return (
    <div style={{
      position: 'absolute', top: HEADER_HEIGHT + 8, right: 260, zIndex: 500,
      width: 320, maxHeight: 'calc(100vh - 80px)',
      background: '#fff', borderRadius: 10,
      border: '1px solid #E5E7EB', boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', borderBottom: '1px solid #F3F4F6',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>Проверка плана</span>
          {errors > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 999,
              background: SEVERITY_STYLE.error.bg, color: SEVERITY_STYLE.error.color,
            }}>
              {errors}
            </span>
          )}
          {warns > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 999,
              background: SEVERITY_STYLE.warn.bg, color: SEVERITY_STYLE.warn.color,
            }}>
              {warns}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#6B7280', lineHeight: 1 }}
        >
          ✕
        </button>
      </div>

      <div style={{ overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {issues.length === 0 ? (
          <div style={{
            padding: 16, textAlign: 'center', fontSize: 12, color: '#6B7280',
            background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8,
            margin: 4,
          }}>
            ✓ Проблем не найдено
          </div>
        ) : (
          issues.map(issue => {
            const s = SEVERITY_STYLE[issue.severity];
            const clickable = !!issue.target && !!onFocus;
            return (
              <button
                key={issue.id}
                onClick={clickable ? () => onFocus!(issue.target!) : undefined}
                disabled={!clickable}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  padding: '8px 10px', borderRadius: 6,
                  background: s.bg, border: `1px solid ${s.border}`,
                  color: s.color, fontSize: 12, textAlign: 'left',
                  cursor: clickable ? 'pointer' : 'default',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{
                  flexShrink: 0, width: 16, height: 16, borderRadius: 999,
                  background: s.color, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700,
                }}>
                  {s.icon}
                </span>
                <span style={{ flex: 1, lineHeight: 1.4 }}>{issue.message}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export function countValidationIssues(
  points: Point[],
  connections: { from_id: string; to_id: string }[],
  polygons: Polygon[],
): number {
  return runValidation(points, connections, polygons).length;
}
