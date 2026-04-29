import React, { useEffect, useRef, useState } from 'react';
import { getPlansTree, createCampus, createBuilding, createStructure, createFloor } from '../api';

interface Floor     { id: number; name: string; sort_order: number; plan: { id: number } | null; }
interface Structure { id: number; name: string; floors: Floor[]; }
interface Building  { id: number; name: string; structures: Structure[]; }
interface Campus    { id: number; name: string; buildings: Building[]; }

const _p = new URLSearchParams(window.location.search);
const PRESELECT_CAMPUS    = Number(_p.get('campus_id'))    || null;
const PRESELECT_BUILDING  = Number(_p.get('building_id'))  || null;
const PRESELECT_STRUCTURE = Number(_p.get('structure_id')) || null;
const PRESELECT_FLOOR     = Number(_p.get('floor_id'))     || null;

// ── inline "add" row ──────────────────────────────────────────────────
function AddRow({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (name: string) => Promise<void>;
}) {
  const [open, setOpen]   = useState(false);
  const [name, setName]   = useState('');
  const [busy, setBusy]   = useState(false);
  const [err,  setErr]    = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true); setErr('');
    try {
      await onAdd(trimmed);
      setName(''); setOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
        style={{
          marginTop: 6, padding: '4px 10px',
          border: '1px dashed #D1D5DB', borderRadius: 6,
          background: 'transparent', color: '#6B7280',
          fontSize: 12, cursor: 'pointer', width: '100%',
        }}
      >
        + Создать
      </button>
    );
  }

  return (
    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setOpen(false); setName(''); } }}
          placeholder={placeholder}
          style={{
            flex: 1, padding: '6px 10px',
            border: '1px solid #2563EB', borderRadius: 6,
            fontSize: 13, outline: 'none',
          }}
        />
        <button
          onClick={submit}
          disabled={busy || !name.trim()}
          style={{
            padding: '6px 12px', border: 'none', borderRadius: 6,
            background: name.trim() ? '#2563EB' : '#E5E7EB',
            color: name.trim() ? '#fff' : '#9CA3AF',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {busy ? '…' : 'Создать'}
        </button>
        <button
          onClick={() => { setOpen(false); setName(''); setErr(''); }}
          style={{ padding: '6px 8px', border: '1px solid #E5E7EB', borderRadius: 6, background: '#fff', color: '#6B7280', fontSize: 13, cursor: 'pointer' }}
        >
          ✕
        </button>
      </div>
      {err && <span style={{ fontSize: 11, color: '#DC2626' }}>{err}</span>}
    </div>
  );
}

// ── main component ───────────────────────────────────────────────────
export const LandingPage: React.FC = () => {
  const [tree,    setTree]    = useState<Campus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const [campusId,    setCampusId]    = useState<number | ''>('');
  const [buildingId,  setBuildingId]  = useState<number | ''>('');
  const [structureId, setStructureId] = useState<number | ''>('');
  const [floorId,     setFloorId]     = useState<number | ''>('');

  const loadTree = (preselect?: number | null) =>
    getPlansTree()
      .then(data => {
        const typed = data as unknown as Campus[];
        setTree(typed);
        setLoading(false);
        const fid = preselect ?? PRESELECT_FLOOR;

        // Preselect by floor_id (highest priority)
        if (fid) {
          for (const campus of typed) {
            for (const building of campus.buildings) {
              for (const structure of building.structures) {
                for (const floor of structure.floors) {
                  if (floor.id === fid) {
                    setCampusId(campus.id);
                    setBuildingId(building.id);
                    setStructureId(structure.id);
                    setFloorId(floor.id);
                    return;
                  }
                }
              }
            }
          }
        }

        // Preselect by structure_id
        if (PRESELECT_STRUCTURE) {
          for (const campus of typed) {
            for (const building of campus.buildings) {
              for (const structure of building.structures) {
                if (structure.id === PRESELECT_STRUCTURE) {
                  setCampusId(campus.id);
                  setBuildingId(building.id);
                  setStructureId(structure.id);
                  return;
                }
              }
            }
          }
        }

        // Preselect by building_id
        if (PRESELECT_BUILDING) {
          for (const campus of typed) {
            for (const building of campus.buildings) {
              if (building.id === PRESELECT_BUILDING) {
                setCampusId(campus.id);
                setBuildingId(building.id);
                return;
              }
            }
          }
        }

        // Preselect by campus_id
        if (PRESELECT_CAMPUS) {
          const campus = typed.find(c => c.id === PRESELECT_CAMPUS);
          if (campus) setCampusId(campus.id);
        }
      })
      .catch(e => { setError((e as Error).message); setLoading(false); });

  useEffect(() => { loadTree(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const campus    = tree.find(c => c.id === campusId);
  const building  = campus?.buildings.find(b => b.id === buildingId);
  const structure = building?.structures.find(s => s.id === structureId);
  const floor     = structure?.floors.find(f => f.id === floorId);

  const handleCampus    = (id: number | '') => { setCampusId(id); setBuildingId(''); setStructureId(''); setFloorId(''); };
  const handleBuilding  = (id: number | '') => { setBuildingId(id); setStructureId(''); setFloorId(''); };
  const handleStructure = (id: number | '') => { setStructureId(id); setFloorId(''); };

  // ── styles ──────────────────────────────────────────────────────────
  const selectStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    border: '1px solid #D1D5DB', borderRadius: 8,
    fontSize: 14, color: '#111827', background: '#fff',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236B7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
    cursor: 'pointer', outline: 'none',
  };
  const disabledSelect: React.CSSProperties = { ...selectStyle, background: '#F9FAFB', color: '#9CA3AF', cursor: 'not-allowed' };
  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, display: 'block',
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#F3F4F6',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.10)', padding: '40px 44px', width: 480, maxWidth: '90vw' }}>

        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Редактор планов этажей</div>
          <div style={{ fontSize: 14, color: '#6B7280' }}>Выберите этаж для редактирования</div>
        </div>

        {loading && <div style={{ color: '#6B7280', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>Загрузка структуры…</div>}
        {error   && <div style={{ color: '#DC2626', fontSize: 13, background: '#FEF2F2', padding: '10px 14px', borderRadius: 8, marginBottom: 24 }}>Ошибка: {error}</div>}

        {!loading && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Campus */}
            <div>
              <span style={labelStyle}>Кампус</span>
              <select style={selectStyle} value={campusId} onChange={e => handleCampus(Number(e.target.value) || '')}>
                <option value="">— выберите кампус —</option>
                {tree.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <AddRow
                placeholder="Название кампуса"
                onAdd={async name => {
                  const created = await createCampus(name);
                  await loadTree();
                  setCampusId(created.id); setBuildingId(''); setStructureId(''); setFloorId('');
                }}
              />
            </div>

            {/* Building */}
            <div>
              <span style={labelStyle}>Корпус</span>
              <select style={campus ? selectStyle : disabledSelect} disabled={!campus} value={buildingId} onChange={e => handleBuilding(Number(e.target.value) || '')}>
                <option value="">— выберите корпус —</option>
                {campus?.buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              {campus && (
                <AddRow
                  placeholder="Название корпуса"
                  onAdd={async name => {
                    const created = await createBuilding(campus.id, name);
                    await loadTree();
                    setBuildingId(created.id); setStructureId(''); setFloorId('');
                  }}
                />
              )}
            </div>

            {/* Structure */}
            <div>
              <span style={labelStyle}>Секция / строение</span>
              <select style={building ? selectStyle : disabledSelect} disabled={!building} value={structureId} onChange={e => handleStructure(Number(e.target.value) || '')}>
                <option value="">— выберите секцию —</option>
                {building?.structures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {building && (
                <AddRow
                  placeholder="Название секции"
                  onAdd={async name => {
                    const created = await createStructure(building.id, name);
                    await loadTree();
                    setStructureId(created.id); setFloorId('');
                  }}
                />
              )}
            </div>

            {/* Floor */}
            <div>
              <span style={labelStyle}>Этаж</span>
              <select style={structure ? selectStyle : disabledSelect} disabled={!structure} value={floorId} onChange={e => setFloorId(Number(e.target.value) || '')}>
                <option value="">— выберите этаж —</option>
                {structure?.floors
                  .slice().sort((a, b) => a.sort_order - b.sort_order)
                  .map(f => <option key={f.id} value={f.id}>{f.name}{f.plan ? '' : ' (нет плана)'}</option>)
                }
              </select>
              {structure && (
                <AddRow
                  placeholder="Название этажа"
                  onAdd={async name => {
                    const nextOrder = Math.max(0, ...((structure.floors.map(f => f.sort_order)))) + 1;
                    const created = await createFloor(structure.id, name, nextOrder);
                    await loadTree(created.id);
                  }}
                />
              )}
            </div>

            {/* Open button */}
            <button
              onClick={() => { if (floorId) window.location.href = `?floor_id=${floorId}`; }}
              disabled={!floorId}
              style={{
                marginTop: 8, padding: '11px 0', width: '100%',
                border: 'none', borderRadius: 8,
                background: floorId ? '#2563EB' : '#E5E7EB',
                color: floorId ? '#fff' : '#9CA3AF',
                fontSize: 15, fontWeight: 600,
                cursor: floorId ? 'pointer' : 'not-allowed',
                transition: 'background 0.15s',
              }}
            >
              {floor ? `Открыть «${floor.name}»` : 'Открыть редактор'}
            </button>

          </div>
        )}
      </div>
    </div>
  );
};
