import React, { useEffect, useState } from 'react';
import {
  getCrossFloorEdges,
  createCrossFloorEdge,
  deleteCrossFloorEdge,
  getPlansWithTransitions,
  CrossFloorEdge,
  PlanWithTransitions,
} from '../api';

const NODE_TYPE_LABELS: Record<string, string> = {
  stairs: '🪜 Лестница',
  elevator: '🛗 Лифт',
  passage: '🚪 Переход',
};

type CostPreset = 'stairs' | 'elevator' | 'mezzanine' | 'custom';

// distance — физическая дистанция (м), weight — множитель предпочтения
// cost в Дейкстре = distance × weight
const COST_PRESETS: { value: CostPreset; label: string; hint: string; distance: number; weight: number }[] = [
  { value: 'stairs',    label: '🪜 Лестница',  hint: '15 м · ×1.0 = 15',   distance: 15, weight: 1.0 },
  { value: 'elevator',  label: '🛗 Лифт',       hint: '15 м · ×0.7 ≈ 10.5', distance: 15, weight: 0.7 },
  { value: 'mezzanine', label: '🏗️ Антресоль', hint: '7 м · ×1.0 = 7',     distance:  7, weight: 1.0 },
  { value: 'custom',    label: '✏️ Другой',     hint: '',                    distance: 15, weight: 1.0 },
];

export const CrossFloorPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [edges, setEdges] = useState<CrossFloorEdge[]>([]);
  const [plans, setPlans] = useState<PlanWithTransitions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fromPlanId, setFromPlanId] = useState<number | ''>('');
  const [fromNodeId, setFromNodeId] = useState<number | ''>('');
  const [toPlanId, setToPlanId] = useState<number | ''>('');
  const [toNodeId, setToNodeId] = useState<number | ''>('');
  const [preset, setPreset] = useState<CostPreset>('stairs');
  const [customDistance, setCustomDistance] = useState('15');
  const [customWeight, setCustomWeight] = useState('1.0');
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const [e, p] = await Promise.all([getCrossFloorEdges(), getPlansWithTransitions()]);
      setEdges(e);
      setPlans(p);
    } catch (ex) {
      setError((ex as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const fromNodes = plans.find(p => p.plan_id === fromPlanId)?.transition_nodes ?? [];
  const toNodes   = plans.find(p => p.plan_id === toPlanId)?.transition_nodes ?? [];

  const activePreset = COST_PRESETS.find(p => p.value === preset)!;
  const effectiveDistance = preset === 'custom' ? (parseFloat(customDistance) || 15) : activePreset.distance;
  const effectiveWeight   = preset === 'custom' ? (parseFloat(customWeight)   || 1.0) : activePreset.weight;
  const effectiveCost     = Math.round(effectiveDistance * effectiveWeight * 10) / 10;

  const handleCreate = async () => {
    if (!fromNodeId || !toNodeId) return;
    setSaving(true);
    setError(null);
    try {
      await createCrossFloorEdge(Number(fromNodeId), Number(toNodeId), effectiveDistance, effectiveWeight);
      setFromPlanId(''); setFromNodeId(''); setToPlanId(''); setToNodeId('');
      setPreset('stairs');
      await reload();
    } catch (ex) {
      setError((ex as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setError(null);
    try {
      await deleteCrossFloorEdge(id);
      setEdges(prev => prev.filter(e => e.id !== id));
    } catch (ex) {
      setError((ex as Error).message);
    }
  };

  const explicitEdges = edges.filter(e => !e.is_virtual);
  const virtualEdges  = edges.filter(e => e.is_virtual);

  const s: Record<string, React.CSSProperties> = {
    overlay: {
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000,
    },
    panel: {
      background: '#fff', borderRadius: 12,
      width: 620, maxWidth: '95vw', maxHeight: '85vh',
      display: 'flex', flexDirection: 'column',
      boxShadow: '0 12px 48px rgba(0,0,0,0.22)',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      overflow: 'hidden',
    },
    header: {
      padding: '16px 20px', borderBottom: '1px solid #E5E7EB',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    },
    body: { padding: '16px 20px', overflowY: 'auto', flex: 1 },
    section: { marginBottom: 20 },
    sectionTitle: { fontWeight: 600, fontSize: 13, marginBottom: 10 },
    label: { fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 4 },
    row: { display: 'flex', gap: 8, alignItems: 'flex-end' },
    select: {
      flex: 1, padding: '6px 8px',
      border: '1px solid #D1D5DB', borderRadius: 6,
      fontSize: 12, color: '#111827',
    },
    input: {
      width: 80, padding: '6px 8px',
      border: '1px solid #D1D5DB', borderRadius: 6,
      fontSize: 12, color: '#111827',
    },
    btn: {
      padding: '6px 14px', border: 'none', borderRadius: 6,
      background: '#2563EB', color: '#fff', fontSize: 12, fontWeight: 600,
      cursor: 'pointer', whiteSpace: 'nowrap' as const,
    },
    edgeRow: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 10px', borderRadius: 6, background: '#F9FAFB',
      marginBottom: 6, fontSize: 12,
    },
    virtualRow: {
      display: 'flex', alignItems: 'center',
      padding: '8px 10px', borderRadius: 6,
      background: '#EFF6FF', border: '1px solid #BFDBFE',
      marginBottom: 6, fontSize: 12,
    },
    del: {
      background: 'none', border: 'none', cursor: 'pointer',
      color: '#EF4444', fontSize: 16, lineHeight: 1, flexShrink: 0,
    },
  };

  const nodeLabel = (n: { id: number; name: string | null; node_type: string }) =>
    `${NODE_TYPE_LABELS[n.node_type] ?? n.node_type}${n.name ? ` — ${n.name}` : ''} (id ${n.id})`;

  const edgeLabel = (e: CrossFloorEdge) => (
    <>
      <b>{e.from_node.floor_name}</b> · {nodeLabel(e.from_node)}
      <span style={{ color: '#9CA3AF', margin: '0 6px' }}>↔</span>
      <b>{e.to_node.floor_name}</b> · {nodeLabel(e.to_node)}
      <span style={{ color: '#9CA3AF', marginLeft: 8 }}>~{e.cost}м</span>
    </>
  );

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.panel} onClick={e => e.stopPropagation()}>
        <div style={s.header}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Межэтажные связи</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6B7280' }}>×</button>
        </div>

        <div style={s.body}>
          {error && (
            <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 12 }}>
              {error}
            </div>
          )}

          {/* Create form */}
          <div style={s.section}>
            <div style={s.sectionTitle}>Новая явная связь</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
              <div>
                <span style={s.label}>Этаж А</span>
                <select style={s.select} value={fromPlanId} onChange={e => { setFromPlanId(Number(e.target.value)); setFromNodeId(''); }}>
                  <option value="">— выберите —</option>
                  {plans.map(p => <option key={p.plan_id} value={p.plan_id}>{p.floor_name}</option>)}
                </select>
              </div>
              <div>
                <span style={s.label}>Этаж Б</span>
                <select style={s.select} value={toPlanId} onChange={e => { setToPlanId(Number(e.target.value)); setToNodeId(''); }}>
                  <option value="">— выберите —</option>
                  {plans.filter(p => p.plan_id !== fromPlanId).map(p => <option key={p.plan_id} value={p.plan_id}>{p.floor_name}</option>)}
                </select>
              </div>
              <div>
                <span style={s.label}>Узел на этаже А</span>
                <select style={s.select} value={fromNodeId} onChange={e => setFromNodeId(Number(e.target.value))} disabled={!fromPlanId}>
                  <option value="">— выберите —</option>
                  {fromNodes.map(n => <option key={n.id} value={n.id}>{nodeLabel(n)}</option>)}
                </select>
              </div>
              <div>
                <span style={s.label}>Узел на этаже Б</span>
                <select style={s.select} value={toNodeId} onChange={e => setToNodeId(Number(e.target.value))} disabled={!toPlanId}>
                  <option value="">— выберите —</option>
                  {toNodes.map(n => <option key={n.id} value={n.id}>{nodeLabel(n)}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <span style={s.label}>Тип перехода</span>
                <select
                  style={{ ...s.select, flex: 'none', minWidth: 170 }}
                  value={preset}
                  onChange={e => setPreset(e.target.value as CostPreset)}
                >
                  {COST_PRESETS.map(p => (
                    <option key={p.value} value={p.value}>
                      {p.label}{p.hint ? ` (${p.hint})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {preset === 'custom' ? (
                <>
                  <div>
                    <span style={s.label}>Дистанция, м</span>
                    <input type="number" step="1" min="1" style={s.input}
                      value={customDistance} onChange={e => setCustomDistance(e.target.value)} />
                  </div>
                  <div>
                    <span style={s.label}>Множитель</span>
                    <input type="number" step="0.1" min="0.1" style={s.input}
                      value={customWeight} onChange={e => setCustomWeight(e.target.value)} />
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 11, color: '#6B7280', alignSelf: 'flex-end', paddingBottom: 8 }}>
                  стоимость в маршруте ≈ {effectiveCost} м
                </div>
              )}
              <button
                style={{ ...s.btn, opacity: (!fromNodeId || !toNodeId || saving) ? 0.5 : 1, marginTop: 'auto' }}
                onClick={handleCreate}
                disabled={!fromNodeId || !toNodeId || saving}
              >
                {saving ? 'Сохраняю…' : '+ Создать'}
              </button>
            </div>
          </div>

          {/* Explicit edges */}
          <div style={s.section}>
            <div style={s.sectionTitle}>
              Явные связи ({loading ? '…' : explicitEdges.length})
            </div>
            {loading ? (
              <div style={{ fontSize: 12, color: '#9CA3AF' }}>Загрузка…</div>
            ) : explicitEdges.length === 0 ? (
              <div style={{ fontSize: 12, color: '#9CA3AF' }}>Нет явных связей</div>
            ) : (
              explicitEdges.map(e => (
                <div key={e.id} style={s.edgeRow}>
                  <span style={{ flex: 1 }}>{edgeLabel(e)}</span>
                  <button style={s.del} onClick={() => handleDelete(e.id)} title="Удалить">×</button>
                </div>
              ))
            )}
          </div>

          {/* Virtual (name-matched) edges */}
          <div style={s.section}>
            <div style={s.sectionTitle}>
              Автоматические связи ({loading ? '…' : virtualEdges.length})
              <span style={{ fontWeight: 400, color: '#6B7280', marginLeft: 8, fontSize: 11 }}>
                по совпадению имён узлов
              </span>
            </div>
            {!loading && virtualEdges.length === 0 && (
              <div style={{ fontSize: 12, color: '#9CA3AF' }}>Нет автоматических связей</div>
            )}
            {virtualEdges.map((e, idx) => (
              <div key={idx} style={s.virtualRow}>
                <span style={{ flex: 1 }}>{edgeLabel(e)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
