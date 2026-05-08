import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildRoutePreview,
  PreviewObject,
  RoutePreviewResponse,
  searchObjectsPreview,
} from '../api';
import { HEADER_HEIGHT } from '../constants';

export interface RouteOverlay {
  polyline: Array<{ x: number; y: number }>;
  stepMarkers: Array<{ x: number; y: number; instruction: string }>;
}

interface Props {
  currentPlanId: number;
  onRouteChange: (overlay: RouteOverlay | null) => void;
  onClose: () => void;
}

interface SearchFieldProps {
  label: string;
  value: PreviewObject | null;
  onChange: (obj: PreviewObject | null) => void;
}

function SearchField({ label, value, onChange }: SearchFieldProps) {
  const [text, setText] = useState(value?.name ?? '');
  const [suggestions, setSuggestions] = useState<PreviewObject[]>([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setText(value?.name ?? '');
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setText(q);
    onChange(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim()) { setSuggestions([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await searchObjectsPreview(q);
        setSuggestions(res.slice(0, 8));
        setOpen(res.length > 0);
      } catch { /* ignore */ }
    }, 280);
  };

  const select = (obj: PreviewObject) => {
    onChange(obj);
    setText(obj.name);
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 3 }}>{label}</div>
      <input
        value={text}
        onChange={handleChange}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Название помещения…"
        style={{
          width: '100%', padding: '7px 10px', fontSize: 13,
          border: '1px solid #D1D5DB', borderRadius: 6,
          outline: 'none', boxSizing: 'border-box',
        }}
      />
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0,
          background: '#fff', border: '1px solid #E5E7EB', borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 2000,
          maxHeight: 200, overflowY: 'auto',
        }}>
          {suggestions.map(s => (
            <button
              key={s.id}
              onMouseDown={() => select(s)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '6px 10px', border: 'none', background: 'transparent',
                cursor: 'pointer', fontSize: 13,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F3F4F6')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontWeight: 500 }}>{s.name}</span>
              <span style={{ color: '#9CA3AF', marginLeft: 6, fontSize: 11 }}>
                {s.floor_name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RoutePreviewPanel({ currentPlanId, onRouteChange, onClose }: Props) {
  const [from, setFrom] = useState<PreviewObject | null>(null);
  const [to, setTo]     = useState<PreviewObject | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [result, setResult]   = useState<RoutePreviewResponse | null>(null);

  const buildOverlay = (r: RoutePreviewResponse): RouteOverlay | null => {
    const seg = r.segments.find(s => s.plan_id === currentPlanId);
    if (!seg) return null;
    const stepsOnPlan = r.steps.filter(s => s.plan_id === currentPlanId);
    return {
      polyline: seg.polyline,
      stepMarkers: stepsOnPlan.map(s => ({ x: s.x, y: s.y, instruction: s.instruction })),
    };
  };

  const check = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const r = await buildRoutePreview(from.id, to.id);
      setResult(r);
      onRouteChange(buildOverlay(r));
    } catch (e) {
      setError((e as Error).message);
      onRouteChange(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, currentPlanId, onRouteChange]);

  const clear = () => {
    setFrom(null);
    setTo(null);
    setResult(null);
    setError(null);
    onRouteChange(null);
  };

  const segForThisFloor = result?.segments.find(s => s.plan_id === currentPlanId);
  const otherFloors = result?.segments.filter(s => s.plan_id !== currentPlanId) ?? [];

  return (
    <div style={{
      position: 'absolute', top: HEADER_HEIGHT + 8, right: 260, zIndex: 500,
      width: 280, background: '#fff', borderRadius: 10,
      border: '1px solid #E5E7EB', boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
      padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Проверка маршрута</span>
        <button
          onClick={() => { clear(); onClose(); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#6B7280', lineHeight: 1 }}
        >
          ✕
        </button>
      </div>

      <SearchField label="Откуда" value={from} onChange={setFrom} />
      <SearchField label="Куда"   value={to}   onChange={setTo} />

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={check}
          disabled={!from || !to || loading}
          style={{
            flex: 1, padding: '7px 0', fontSize: 13, fontWeight: 600,
            background: (!from || !to || loading) ? '#E5E7EB' : '#2563EB',
            color: (!from || !to || loading) ? '#9CA3AF' : '#fff',
            border: 'none', borderRadius: 6, cursor: (!from || !to || loading) ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Строим…' : 'Проверить'}
        </button>
        {result && (
          <button
            onClick={clear}
            style={{ padding: '7px 10px', fontSize: 13, background: '#F3F4F6', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#374151' }}
          >
            Сбросить
          </button>
        )}
      </div>

      {error && (
        <div style={{ fontSize: 12, color: '#DC2626', background: '#FEF2F2', padding: '6px 8px', borderRadius: 6 }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ fontSize: 12, color: '#374151', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontWeight: 500 }}>
            {Math.round(result.total_distance)} м · ~{Math.max(1, Math.round(result.total_distance / 67))} мин
          </div>
          {segForThisFloor ? (
            <div style={{ color: '#16A34A' }}>
              ✓ Маршрут проходит по этому плану ({segForThisFloor.polyline.length} точек)
            </div>
          ) : (
            <div style={{ color: '#9CA3AF' }}>— На этом этаже маршрут не проходит</div>
          )}
          {otherFloors.length > 0 && (
            <div style={{ color: '#6B7280' }}>
              Также: {otherFloors.map(s => s.floor_name).join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
