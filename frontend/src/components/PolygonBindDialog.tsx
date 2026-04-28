import React, { useState, useEffect, useRef } from 'react';
import { useEditorStore } from '../store/editorStore';
import { getObjectTypes, createObjectType, createObject } from '../api';

/**
 * Modal dialog that appears after a polygon is drawn.
 * Lets the user bind the polygon to a DB object and set one or more entry nav-nodes.
 */
export const PolygonBindDialog: React.FC = () => {
  const store = useEditorStore();
  const { pendingPolygon, dbObjects, points, planId, addPolygon, setPendingPolygon, autoBindOnMatch } = store;

  const [mode, setMode] = useState<'existing' | 'new'>('new');
  const [selectedObjectId, setSelectedObjectId] = useState<number | ''>('');
  const [newObjectName, setNewObjectName] = useState('');
  const [description, setDescription] = useState('');
  const [entryNodeIds, setEntryNodeIds] = useState<string[]>([]);
  const [addingNode, setAddingNode] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoBindFired = useRef(false);

  const bindablePoints = points.filter(p => p.node_type !== 'corridor' && p.node_type !== 'passage');

  const BINDABLE_TYPES = ['room', 'passage', 'stairs', 'elevator', 'toilet', 'exit'] as const;

  // Pre-fill name and auto-select matching nav-node
  useEffect(() => {
    if (!pendingPolygon) { autoBindFired.current = false; return; }
    setNewObjectName(pendingPolygon.suggestedName);
    setSelectedObjectId('');
    setDescription('');
    setError(null);
    setMode('new');
    setAddingNode('');
    const match = points.find(
      p => (BINDABLE_TYPES as readonly string[]).includes(p.node_type) && p.name === pendingPolygon.suggestedName
    );
    setEntryNodeIds(match ? [match.id] : []);
  }, [pendingPolygon]);

  // Auto-bind: skip dialog when flag is on and a matching node exists
  useEffect(() => {
    if (!pendingPolygon || !autoBindOnMatch || !planId || autoBindFired.current) return;
    const match = points.find(
      p => (BINDABLE_TYPES as readonly string[]).includes(p.node_type) && p.name === pendingPolygon.suggestedName
    );
    if (!match) return;

    autoBindFired.current = true;
    const name = pendingPolygon.suggestedName || 'Без названия';
    setLoading(true);
    (async () => {
      try {
        let types = await getObjectTypes();
        let typeId: number;
        if (types.length === 0) {
          const t = await createObjectType({ name: 'Помещение' });
          typeId = t.id;
        } else {
          typeId = types[0].id;
        }
        const obj = await createObject({ plan_id: planId, object_type_id: typeId, name, description: null });
        store.setDbObjects([
          ...dbObjects,
          { id: obj.id, name: obj.name, description: obj.description,
            object_type_id: obj.object_type.id, object_type_name: obj.object_type.name,
            polygon_points: pendingPolygon.points, nav_node_ids: [Number(match.id)] },
        ]);
        addPolygon({
          object_id: obj.id,
          points: pendingPolygon.points,
          name: obj.name,
          description: null,
          nav_node_client_ids: [match.id],
        });
        setPendingPolygon(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [pendingPolygon, autoBindOnMatch]);

  if (!pendingPolygon) return null;

  const isAutoBind = autoBindOnMatch && loading && !!points.find(
    p => (BINDABLE_TYPES as readonly string[]).includes(p.node_type) && p.name === pendingPolygon.suggestedName
  );

  const handleCancel = () => setPendingPolygon(null);

  const handleConfirm = async () => {
    if (!planId) { setError('planId не установлен — перезагрузите страницу'); return; }
    setLoading(true);
    setError(null);

    try {
      let objectId: number;
      let objectName: string;

      if (mode === 'existing') {
        if (!selectedObjectId) { setError('Выберите объект'); setLoading(false); return; }
        const obj = dbObjects.find(o => o.id === selectedObjectId)!;
        objectId   = obj.id;
        objectName = obj.name;
      } else {
        const name = newObjectName.trim() || 'Без названия';
        let types = await getObjectTypes();
        let typeId: number;
        if (types.length === 0) {
          const t = await createObjectType({ name: 'Помещение' });
          typeId = t.id;
        } else {
          typeId = types[0].id;
        }
        const desc = description.trim() || null;
        const obj = await createObject({ plan_id: planId, object_type_id: typeId, name, description: desc });
        objectId   = obj.id;
        objectName = obj.name;
        store.setDbObjects([
          ...dbObjects,
          { id: obj.id, name: obj.name, description: obj.description,
            object_type_id: obj.object_type.id, object_type_name: obj.object_type.name,
            polygon_points: pendingPolygon.points, nav_node_ids: entryNodeIds.map(Number) },
        ]);
      }

      addPolygon({
        object_id: objectId,
        points: pendingPolygon.points,
        name: objectName,
        description: description.trim() || null,
        nav_node_client_ids: entryNodeIds,
      });
      setPendingPolygon(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const removeEntry = (id: string) => setEntryNodeIds(prev => prev.filter(x => x !== id));
  const addEntry = (id: string) => {
    if (id && !entryNodeIds.includes(id)) setEntryNodeIds(prev => [...prev, id]);
    setAddingNode('');
  };

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.35)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  };
  const panel: React.CSSProperties = {
    background: '#fff', borderRadius: 10,
    padding: '20px 24px', width: 380, maxWidth: '90vw',
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    display: 'flex', flexDirection: 'column', gap: 14,
  };
  const label: React.CSSProperties = {
    fontSize: 12, color: '#6B7280', display: 'block', marginBottom: 4,
  };
  const input: React.CSSProperties = {
    width: '100%', padding: '6px 10px',
    border: '1px solid #D1D5DB', borderRadius: 6,
    fontSize: 13, color: '#111827', boxSizing: 'border-box',
  };
  const select: React.CSSProperties = { ...input };

  if (isAutoBind) return (
    <div style={overlay}>
      <div style={{ ...panel, alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, color: '#6B7280' }}>Привязываю «{pendingPolygon.suggestedName}»…</span>
        {error && <span style={{ fontSize: 12, color: '#DC2626' }}>{error}</span>}
      </div>
    </div>
  );

  return (
    <div style={overlay} onClick={handleCancel}>
      <div style={panel} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>
          Привязка полигона к объекту
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 8 }}>
          {(['new', 'existing'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              disabled={m === 'existing' && dbObjects.length === 0}
              style={{
                flex: 1, padding: '5px 0', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                border: '1px solid', fontWeight: mode === m ? 600 : 400,
                borderColor: mode === m ? '#2563EB' : '#D1D5DB',
                background:  mode === m ? '#EFF6FF' : '#fff',
                color:        mode === m ? '#2563EB' : '#6B7280',
                opacity: m === 'existing' && dbObjects.length === 0 ? 0.4 : 1,
              }}
            >
              {m === 'new' ? 'Создать объект' : 'Выбрать из списка'}
            </button>
          ))}
        </div>

        {/* New object */}
        {mode === 'new' && (
          <div>
            <span style={label}>Название нового объекта</span>
            <input
              style={input}
              value={newObjectName}
              onChange={e => setNewObjectName(e.target.value)}
              placeholder="Аудитория 101"
              autoFocus
            />
          </div>
        )}

        {/* Existing object picker */}
        {mode === 'existing' && (
          <div>
            <span style={label}>Объект</span>
            <select
              style={select}
              value={selectedObjectId}
              onChange={e => {
                const id = Number(e.target.value);
                setSelectedObjectId(id);
                const obj = dbObjects.find(o => o.id === id);
                setDescription(obj?.description ?? '');
              }}
            >
              <option value="">— выберите —</option>
              {dbObjects.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Description (optional) */}
        <div>
          <span style={label}>Описание (опционально)</span>
          <textarea
            style={{ ...input, resize: 'vertical', minHeight: 56, fontFamily: 'inherit' } as React.CSSProperties}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Лекционная аудитория на 120 мест"
            rows={2}
          />
        </div>

        {/* Entry nav-nodes */}
        <div>
          <span style={label}>Точки входа</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {entryNodeIds.length === 0 && (
              <span style={{ fontSize: 11, color: '#9CA3AF' }}>нет — маршрут к объекту недоступен</span>
            )}
            {entryNodeIds.map(id => {
              const pt = points.find(p => p.id === id);
              const label = pt?.name || `${pt?.node_type ?? 'node'} [${pt?.x.toFixed(0)}, ${pt?.y.toFixed(0)}]`;
              return (
                <span key={id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: '#EFF6FF', border: '1px solid #BFDBFE',
                  borderRadius: 4, padding: '2px 6px', fontSize: 11, color: '#1D4ED8',
                }}>
                  {label}
                  <button
                    onClick={() => removeEntry(id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 0, lineHeight: 1 }}
                  >×</button>
                </span>
              );
            })}
          </div>
          <select
            style={{ ...select, width: 'auto', minWidth: '100%' }}
            value={addingNode}
            onChange={e => addEntry(e.target.value)}
          >
            <option value="">+ добавить точку входа</option>
            {bindablePoints
              .filter(p => !entryNodeIds.includes(p.id))
              .map(p => (
                <option key={p.id} value={p.id}>
                  {p.name || `${p.node_type} [${p.x.toFixed(0)}, ${p.y.toFixed(0)}]`}
                </option>
              ))}
          </select>
        </div>

        {error && (
          <div style={{ fontSize: 12, color: '#DC2626', background: '#FEF2F2', padding: '6px 10px', borderRadius: 6 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            onClick={handleCancel}
            style={{ padding: '6px 16px', border: '1px solid #D1D5DB', borderRadius: 6, background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer' }}
          >
            Отмена
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            style={{ padding: '6px 16px', border: 'none', borderRadius: 6, background: '#2563EB', color: '#fff', fontSize: 13, fontWeight: 600, cursor: loading ? 'wait' : 'pointer' }}
          >
            {loading ? 'Сохраняю…' : 'Готово'}
          </button>
        </div>
      </div>
    </div>
  );
};
