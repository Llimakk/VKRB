import React from 'react';
import { useEditorStore } from '../store/editorStore';
import { EditorMode, NodeType } from '../types';

const MODES: { value: EditorMode; icon: string; label: string; title: string }[] = [
  { value: 'create',  icon: '📍', label: 'Точки',   title: 'Добавить точку' },
  { value: 'edit',    icon: '↔️', label: 'Правка',  title: 'Перетащить точку' },
  { value: 'connect', icon: '🔗', label: 'Связи',   title: 'Соединить точки' },
  { value: 'bind',    icon: '🔁', label: 'Входы',   title: 'Привязать точки входа к полигону' },
  { value: 'polygon', icon: '🔷', label: 'Полигон', title: 'Нарисовать полигон' },
  { value: 'measure', icon: '📏', label: 'Линейка', title: 'Измерить расстояние' },
  { value: 'delete',  icon: '🗑',  label: 'Удалить', title: 'Удалить элемент' },
];

const NODE_TYPES: { value: NodeType; label: string; color: string }[] = [
  { value: 'room',     label: 'Комната',   color: '#007AFF' },
  { value: 'toilet',   label: 'Туалет',    color: '#06B6D4' },
  { value: 'stairs',   label: 'Лестница',  color: '#AF52DE' },
  { value: 'elevator', label: 'Лифт',      color: '#34C759' },
  { value: 'exit',     label: 'Выход',     color: '#FF3B30' },
  { value: 'corridor', label: 'Коридор',   color: '#5AC8FA' },
  { value: 'passage',  label: 'Переход',   color: '#F59E0B' },
];

export const ModeSelector: React.FC = () => {
  const {
    mode, setMode,
    polygonPoints, settings, finishPolygon,
    measurementSegments, clearMeasurements,
    nodeTypeToCreate, setNodeTypeToCreate,
    autoConnectRoomsToCorridor,
    autoBindOnMatch, setAutoBindOnMatch,
    autoConnectCorridor, setAutoConnectCorridor,
  } = useEditorStore();

  const handleFinishPolygon = () => {
    if (polygonPoints.length < 3) return;
    let name = '';
    if (settings.askNames) {
      const result = prompt('Название полигона:');
      if (result === null) return;
      name = result;
    }
    finishPolygon(polygonPoints, name);
  };

  const btnBase: React.CSSProperties = {
    width: '52px', height: '52px',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    gap: '2px', border: 'none', borderRadius: '8px',
    cursor: 'pointer', padding: '4px', transition: 'background 0.15s',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0', gap: '2px', width: '100%' }}>

      {/* Mode buttons */}
      {MODES.map((m) => {
        const active = mode === m.value;
        return (
          <button
            key={m.value}
            onClick={() => setMode(m.value)}
            title={m.title}
            style={{
              ...btnBase,
              background: active ? '#2563EB' : 'transparent',
              color: active ? '#fff' : '#6B7280',
            }}
          >
            <span style={{ fontSize: '18px', lineHeight: 1 }}>{m.icon}</span>
            <span style={{ fontSize: '9px', fontWeight: active ? '600' : '400', lineHeight: 1 }}>
              {m.label}
            </span>
          </button>
        );
      })}

      <div style={{ width: '36px', height: '1px', background: '#E5E7EB', margin: '4px 0' }} />

      {/* Node type picker — shown only in create mode */}
      {mode === 'create' && nodeTypeToCreate === 'corridor' && (
        <label
          title="Автоматически соединять новую точку коридора с предыдущей"
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 2, cursor: 'pointer', padding: '4px 2px',
          }}
        >
          <input
            type="checkbox"
            checked={autoConnectCorridor}
            onChange={e => setAutoConnectCorridor(e.target.checked)}
            style={{ margin: 0 }}
          />
          <span style={{ fontSize: '8px', color: '#6B7280', textAlign: 'center', lineHeight: 1.2 }}>
            Авто-<br/>коридор
          </span>
        </label>
      )}

      {mode === 'create' && (
        <>
          {NODE_TYPES.map((nt) => {
            const active = nodeTypeToCreate === nt.value;
            return (
              <button
                key={nt.value}
                onClick={() => setNodeTypeToCreate(nt.value)}
                title={nt.label}
                style={{
                  ...btnBase,
                  background: active ? nt.color : 'transparent',
                  color: active ? '#fff' : nt.color,
                  border: `2px solid ${active ? nt.color : 'transparent'}`,
                  outline: active ? `2px solid ${nt.color}33` : 'none',
                }}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: nt.value === 'elevator' ? 2 : nt.value === 'toilet' ? 0 : 99,
                  background: active ? '#fff' : nt.color,
                  transform: nt.value === 'door' ? 'rotate(45deg)' : 'none',
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: '8px', fontWeight: active ? '600' : '400', lineHeight: 1 }}>
                  {nt.label}
                </span>
              </button>
            );
          })}
          <div style={{ width: '36px', height: '1px', background: '#E5E7EB', margin: '4px 0' }} />
        </>
      )}

      {/* Polygon finish */}
      {mode === 'polygon' && (
        <>
          <label
            title="Если найдена точка типа «комната» с таким же именем — объект создаётся автоматически"
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 2, cursor: 'pointer', padding: '4px 2px',
            }}
          >
            <input
              type="checkbox"
              checked={autoBindOnMatch}
              onChange={e => setAutoBindOnMatch(e.target.checked)}
              style={{ margin: 0 }}
            />
            <span style={{ fontSize: '8px', color: '#6B7280', textAlign: 'center', lineHeight: 1.2 }}>
              Авто-<br/>привязка
            </span>
          </label>
          {polygonPoints.length >= 3 && (
            <button
              onClick={handleFinishPolygon}
              title={`Завершить полигон (${polygonPoints.length} точек)`}
              style={{
                ...btnBase,
                border: '1px solid #D97706', background: '#FEF3C7', color: '#92400E',
              }}
            >
              <span style={{ fontSize: '18px', lineHeight: 1 }}>✅</span>
              <span style={{ fontSize: '9px', fontWeight: '600', lineHeight: 1 }}>Готово</span>
            </button>
          )}
        </>
      )}

      {/* Auto-connect rooms to corridor */}
      <button
        onClick={autoConnectRoomsToCorridor}
        title="Соединить каждую комнату с 2 ближайшими узлами коридора"
        style={{
          ...btnBase,
          border: '1px solid #5AC8FA', background: '#EFF9FF', color: '#0284C7',
        }}
      >
        <span style={{ fontSize: '18px', lineHeight: 1 }}>🔌</span>
        <span style={{ fontSize: '9px', lineHeight: 1 }}>Автосвязь</span>
      </button>

      {/* Measure clear */}
      {mode === 'measure' && measurementSegments.length > 0 && (
        <button
          onClick={clearMeasurements}
          title="Очистить все измерения"
          style={{
            ...btnBase,
            border: '1px solid #D1D5DB', background: '#F9FAFB', color: '#6B7280',
          }}
        >
          <span style={{ fontSize: '18px', lineHeight: 1 }}>🗑</span>
          <span style={{ fontSize: '9px', lineHeight: 1 }}>Сброс</span>
        </button>
      )}
    </div>
  );
};
