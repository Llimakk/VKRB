import React, { useState, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';

export const PolygonEditDialog: React.FC = () => {
  const store = useEditorStore();
  const { editingPolygonIndex, polygons, dbObjects, points, updatePolygon, setEditingPolygonIndex } = store;

  const poly = editingPolygonIndex !== null ? polygons[editingPolygonIndex] : null;

  const [name, setName]               = useState('');
  const [description, setDescription] = useState('');
  const [objectId, setObjectId]       = useState<number | ''>('');
  const [entryNodeId, setEntryNodeId] = useState('');

  useEffect(() => {
    if (!poly) return;
    setName(poly.name ?? '');
    setDescription(poly.description ?? '');
    setObjectId(poly.object_id ?? '');
    setEntryNodeId(poly.nav_node_client_id ?? '');
  }, [editingPolygonIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!poly || editingPolygonIndex === null) return null;

  const close = () => setEditingPolygonIndex(null);

  const handleConfirm = () => {
    updatePolygon(editingPolygonIndex, {
      name:                name.trim() || undefined,
      description:         description.trim() || null,
      object_id:           objectId === '' ? undefined : objectId,
      nav_node_client_id:  entryNodeId || undefined,
    });
    close();
  };

  // UI helpers
  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.35)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  };
  const panel: React.CSSProperties = {
    background: '#fff', borderRadius: 10,
    padding: '20px 24px', width: 400, maxWidth: '90vw',
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    display: 'flex', flexDirection: 'column', gap: 14,
  };
  const lbl: React.CSSProperties = { fontSize: 12, color: '#6B7280', display: 'block', marginBottom: 4 };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 10px',
    border: '1px solid #D1D5DB', borderRadius: 6,
    fontSize: 13, color: '#111827', boxSizing: 'border-box',
  };

  const roomPoints = points.filter(p => p.node_type === 'room');

  return (
    <div style={overlay} onClick={close}>
      <div style={panel} onClick={e => e.stopPropagation()}>

        <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>
          Редактировать полигон
        </div>

        {/* Name */}
        <div>
          <span style={lbl}>Название</span>
          <input
            style={inputStyle}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Аудитория 101"
            autoFocus
          />
        </div>

        {/* Description */}
        <div>
          <span style={lbl}>Описание</span>
          <textarea
            style={{ ...inputStyle, resize: 'vertical', minHeight: 56, fontFamily: 'inherit' } as React.CSSProperties}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Лекционная аудитория на 120 мест"
            rows={2}
          />
        </div>

        {/* Object binding */}
        <div>
          <span style={lbl}>Объект в БД</span>
          <select
            style={inputStyle}
            value={objectId}
            onChange={e => {
              const id = Number(e.target.value) || '';
              setObjectId(id);
              if (id) {
                const obj = dbObjects.find(o => o.id === id);
                if (obj) {
                  if (!name) setName(obj.name);
                  if (!description) setDescription(obj.description ?? '');
                }
              }
            }}
          >
            <option value="">— не привязан —</option>
            {dbObjects.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>

        {/* Entry nav-node */}
        <div>
          <span style={lbl}>Точка входа (room-тип)</span>
          <select
            style={inputStyle}
            value={entryNodeId}
            onChange={e => setEntryNodeId(e.target.value)}
          >
            <option value="">— без точки входа —</option>
            {roomPoints.map(p => (
              <option key={p.id} value={p.id}>
                {p.name || `room [${p.x.toFixed(0)}, ${p.y.toFixed(0)}]`}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4, display: 'block' }}>
            Узел навигационного графа у входа в помещение
          </span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            onClick={close}
            style={{ padding: '6px 16px', border: '1px solid #D1D5DB', borderRadius: 6, background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer' }}
          >
            Отмена
          </button>
          <button
            onClick={handleConfirm}
            style={{ padding: '6px 16px', border: 'none', borderRadius: 6, background: '#2563EB', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Сохранить
          </button>
        </div>

      </div>
    </div>
  );
};
