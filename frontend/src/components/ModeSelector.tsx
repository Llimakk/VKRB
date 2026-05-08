import React from 'react';
import { useEditorStore } from '../store/editorStore';
import { EditorMode, NodeType } from '../types';

// ── Mode SVG icons ────────────────────────────────────────────────────────────

function IcoCreate() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 6.5v7M6.5 10h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function IcoEdit() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M14.2 3.8a1.5 1.5 0 0 1 2.1 2.1L7.5 14.7l-3.8 1 1-3.8 9.5-8.1z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
function IcoConnect() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="4.5" cy="10" r="2.5" fill="currentColor" />
      <circle cx="15.5" cy="10" r="2.5" fill="currentColor" />
      <path d="M7 10h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 1.5" />
    </svg>
  );
}
function IcoBind() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2.5" y="6" width="7" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="15.5" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9.5 10h3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IcoPolygon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 2.5L17.5 8l-2.8 8.5H5.3L2.5 8z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
function IcoMeasure() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 15L15 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3 15l2-2M7.5 10.5l2-2M12 6l2-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="3" cy="15" r="1.5" fill="currentColor" />
      <circle cx="15" cy="3" r="1.5" fill="currentColor" />
    </svg>
  );
}
function IcoDelete() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M6.5 3.5h7M4.5 6.5h11l-1 10h-9l-1-10zM8.5 9.5v4.5M11.5 9.5v4.5"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const MODE_LIST: { value: EditorMode; label: string; title: string; Icon: React.FC }[] = [
  { value: 'create',  label: 'Точки',   title: 'Добавить узел',              Icon: IcoCreate  },
  { value: 'edit',    label: 'Правка',  title: 'Перетащить точку',           Icon: IcoEdit    },
  { value: 'connect', label: 'Связи',   title: 'Соединить точки',            Icon: IcoConnect },
  { value: 'bind',    label: 'Входы',   title: 'Привязать точку к полигону', Icon: IcoBind    },
  { value: 'polygon', label: 'Полигон', title: 'Нарисовать полигон',         Icon: IcoPolygon },
  { value: 'measure', label: 'Линейка', title: 'Измерить расстояние',        Icon: IcoMeasure },
  { value: 'delete',  label: 'Удалить', title: 'Удалить элемент',            Icon: IcoDelete  },
];

// ── Node-type icons (match shapes used on canvas) ─────────────────────────────

function NtRoom({ color }: { color: string }) {
  // Floor-plan view: room rectangle with door opening + swing arc
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <rect x="3" y="3" width="16" height="16" rx="2" fill={color + '22'} stroke={color} strokeWidth="1.8" />
      {/* door gap at bottom */}
      <path d="M8 19h6" stroke="white" strokeWidth="2.8" />
      {/* door swing arc */}
      <path d="M8 14 Q7.5 19.5 14 19" stroke={color} strokeWidth="1" fill="none" strokeDasharray="1.5 1.2" />
    </svg>
  );
}
function NtCorridor({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="11" r="7" stroke={color} strokeWidth="2" strokeDasharray="3 2" />
      <circle cx="11" cy="11" r="2.5" fill={color} />
    </svg>
  );
}
function NtToilet({ color }: { color: string }) {
  // Top-down toilet: tank rectangle + bowl ellipse with water hole
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      {/* tank */}
      <rect x="7" y="2.5" width="8" height="5" rx="1.5" fill={color} />
      {/* seat/bowl */}
      <ellipse cx="11" cy="15" rx="7" ry="6" fill={color} />
      {/* water hole */}
      <ellipse cx="11" cy="15.5" rx="4.5" ry="3.5" fill="white" />
    </svg>
  );
}
function NtStairs({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M4 17h4v-4h4V9h4V5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function NtElevator({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <rect x="4" y="4" width="14" height="14" rx="2.5" fill={color} />
      <path d="M8 10l3-3 3 3M8 12l3 3 3-3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function NtExit({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="11" r="7.5" stroke={color} strokeWidth="2" />
      <path d="M8.5 11h5M11.5 8.5L14 11l-2.5 2.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function NtPassage({ color }: { color: string }) {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return `${11 + 7.5 * Math.cos(a)},${11 + 7.5 * Math.sin(a)}`;
  }).join(' ');
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <polygon points={pts} fill={color} />
      <path d="M8.5 11h5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="1.5 1.5" />
    </svg>
  );
}

const NODE_TYPES: {
  value: NodeType;
  label: string;
  color: string;
  Icon: React.FC<{ color: string }>;
}[] = [
  { value: 'room',     label: 'Комната',  color: '#007AFF', Icon: NtRoom     },
  { value: 'corridor', label: 'Коридор',  color: '#5AC8FA', Icon: NtCorridor },
  { value: 'stairs',   label: 'Лестница', color: '#AF52DE', Icon: NtStairs   },
  { value: 'elevator', label: 'Лифт',     color: '#34C759', Icon: NtElevator },
  { value: 'exit',     label: 'Выход',    color: '#FF3B30', Icon: NtExit     },
  { value: 'toilet',   label: 'Туалет',   color: '#06B6D4', Icon: NtToilet   },
  { value: 'passage',  label: 'Переход',  color: '#F59E0B', Icon: NtPassage  },
];

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label, title }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  title?: string;
}) {
  return (
    <label
      title={title}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 4, cursor: 'pointer', padding: '4px 0', userSelect: 'none',
      }}
    >
      {/* pill track */}
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 32, height: 18, borderRadius: 9,
          background: checked ? '#2563EB' : '#D1D5DB',
          position: 'relative', transition: 'background 0.18s', flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute',
          top: 2, left: checked ? 14 : 2,
          width: 14, height: 14, borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left 0.18s',
        }} />
      </div>
      <span style={{ fontSize: 9, color: '#6B7280', textAlign: 'center', lineHeight: 1.3 }}>
        {label}
      </span>
    </label>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

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

  const divider = (
    <div style={{ width: '60%', height: 1, background: '#E5E7EB', margin: '4px auto' }} />
  );

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'stretch',
      padding: '6px 0', gap: 0, width: '100%',
    }}>

      {/* ── Mode buttons ── */}
      {MODE_LIST.map(({ value, label, title, Icon }) => {
        const active = mode === value;
        return (
          <button
            key={value}
            onClick={() => setMode(value)}
            title={title}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 2,
              height: 52, margin: '1px 6px', borderRadius: 8,
              border: 'none', cursor: 'pointer', padding: '4px 2px',
              background: active ? '#2563EB' : 'transparent',
              color: active ? '#fff' : '#6B7280',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { if (!active) (e.currentTarget.style.background = '#F3F4F6'); }}
            onMouseLeave={e => { if (!active) (e.currentTarget.style.background = 'transparent'); }}
          >
            <Icon />
            <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, lineHeight: 1 }}>
              {label}
            </span>
          </button>
        );
      })}

      {/* ── Auto-connect rooms button (always visible) ── */}
      {divider}
      <button
        onClick={autoConnectRoomsToCorridor}
        title="Соединить каждую комнату с 2 ближайшими узлами коридора"
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 2,
          height: 48, margin: '1px 6px', borderRadius: 8,
          border: '1px solid #BAE6FD', cursor: 'pointer', padding: '4px 2px',
          background: '#F0F9FF', color: '#0284C7',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#E0F2FE'; }}
        onMouseLeave={e => { e.currentTarget.style.background = '#F0F9FF'; }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="4" cy="10" r="2.2" fill="#0284C7" />
          <circle cx="16" cy="5" r="2.2" fill="#0284C7" />
          <circle cx="16" cy="15" r="2.2" fill="#0284C7" />
          <path d="M6 10L14 5.5M6 10L14 14.5" stroke="#0284C7" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: 9, fontWeight: 500, lineHeight: 1.2, textAlign: 'center' }}>
          Авто-<br />связь
        </span>
      </button>

      {/* ── Measure clear ── */}
      {mode === 'measure' && measurementSegments.length > 0 && (
        <>
          {divider}
          <button
            onClick={clearMeasurements}
            title="Очистить все измерения"
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 2,
              height: 48, margin: '1px 6px', borderRadius: 8,
              border: '1px solid #E5E7EB', cursor: 'pointer',
              background: '#F9FAFB', color: '#6B7280',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 9, lineHeight: 1 }}>Сброс</span>
          </button>
        </>
      )}

      {/* ── Create mode: node type picker ── */}
      {mode === 'create' && (
        <>
          {divider}

          {/* Auto-corridor toggle */}
          {nodeTypeToCreate === 'corridor' && (
            <div style={{ padding: '2px 8px 4px' }}>
              <Toggle
                checked={autoConnectCorridor}
                onChange={setAutoConnectCorridor}
                label="Авто-цепь"
                title="Автоматически соединять коридорные узлы в цепочку"
              />
            </div>
          )}

          {/* 2-column node type grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
            gap: 4, padding: '2px 6px',
          }}>
            {NODE_TYPES.map(({ value, label, color, Icon }) => {
              const active = nodeTypeToCreate === value;
              return (
                <button
                  key={value}
                  onClick={() => setNodeTypeToCreate(value)}
                  title={label}
                  style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: 0, padding: '7px 2px',
                    border: active ? `2px solid ${color}` : '2px solid transparent',
                    borderRadius: 8, minWidth: 0,
                    background: active ? `${color}18` : 'transparent',
                    cursor: 'pointer',
                    boxShadow: active ? `inset 0 0 0 1px ${color}60` : 'none',
                    transition: 'background 0.12s, border-color 0.12s',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#F3F4F6'; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  <Icon color={color} />
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── Polygon mode: finish + auto-bind ── */}
      {mode === 'polygon' && (
        <>
          {divider}
          <div style={{ padding: '4px 8px' }}>
            <Toggle
              checked={autoBindOnMatch}
              onChange={setAutoBindOnMatch}
              label="Авто-привязка"
              title="Если найдена точка «комната» с таким же именем — объект создаётся автоматически"
            />
          </div>
          {polygonPoints.length >= 3 && (
            <button
              onClick={handleFinishPolygon}
              title={`Завершить полигон (${polygonPoints.length} точек)`}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 2,
                height: 52, margin: '2px 6px', borderRadius: 8,
                border: '1.5px solid #D97706', cursor: 'pointer',
                background: '#FFFBEB', color: '#92400E',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#FEF3C7'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#FFFBEB'; }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M4 10l4.5 4.5 7.5-8" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ fontSize: 9, fontWeight: 600, lineHeight: 1 }}>Готово</span>
            </button>
          )}
        </>
      )}

    </div>
  );
};
