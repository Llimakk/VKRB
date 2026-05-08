import React, { useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { loadPlanGraph, savePlanGraph } from '../api';

// ── Reusable header button ────────────────────────────────────────────────────

function HBtn({
  children, onClick, disabled = false, danger = false, title, iconOnly = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
  iconOnly?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: 30,
        padding: iconOnly ? '0 7px' : '0 10px',
        border: `1px solid ${disabled ? '#E5E7EB' : danger ? '#FCA5A5' : '#D1D5DB'}`,
        borderRadius: 5,
        background: disabled ? '#F9FAFB'
          : danger && hovered ? '#FEF2F2'
          : hovered ? '#F3F4F6'
          : '#FFFFFF',
        color: disabled ? '#9CA3AF' : danger ? '#DC2626' : '#374151',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 13, fontWeight: 500,
        display: 'inline-flex', alignItems: 'center', gap: 5,
        whiteSpace: 'nowrap' as const,
        transition: 'background 0.12s',
        userSelect: 'none' as const,
      }}
    >
      {children}
    </button>
  );
}

// ── SVG icons (16 × 16) ───────────────────────────────────────────────────────

const S = 16;

function IcoBack() {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" fill="none">
      <path d="M11 8H5M8 5l-3 3 3 3"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IcoUndo() {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" fill="none">
      <path d="M3.5 7h7a3 3 0 0 1 0 6H7"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 4.5L3.5 7l2.5 2.5"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IcoRedo() {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" fill="none">
      <path d="M12.5 7H5.5a3 3 0 0 0 0 6H9"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 4.5l2.5 2.5-2.5 2.5"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IcoSave() {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" fill="none">
      <path d="M8 3v7M5.5 7.5L8 10l2.5-2.5"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 11v1.5A1.5 1.5 0 0 0 4.5 14h7A1.5 1.5 0 0 0 13 12.5V11"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IcoLoad() {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" fill="none">
      <path d="M8 13V6M5.5 8.5L8 6l2.5 2.5"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 11v1.5A1.5 1.5 0 0 0 4.5 14h7A1.5 1.5 0 0 0 13 12.5V11"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IcoTrash() {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" fill="none">
      <path d="M4 5h8M6.5 5V3.5h3V5M5 5l.5 8h5l.5-8"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const divider = (
  <div style={{ width: 1, height: 20, background: '#E5E7EB', flexShrink: 0 }} />
);

// ── Controls component ────────────────────────────────────────────────────────

interface ControlsProps { planId: number; }

export const Controls: React.FC<ControlsProps> = ({ planId }) => {
  const { undo, redo, clear, exportForServer, loadFromServer, historyIndex, history } = useEditorStore();

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const handleLoad = async () => {
    try {
      loadFromServer(await loadPlanGraph(planId));
    } catch (err) {
      alert(`Ошибка загрузки: ${(err as Error).message}`);
    }
  };

  const handleSave = async () => {
    try {
      loadFromServer(await savePlanGraph(planId, exportForServer()));
    } catch (err) {
      alert(`Ошибка сохранения: ${(err as Error).message}`);
    }
  };

  const handleClear = () => {
    if (window.confirm('Очистить всё? Это действие нельзя отменить.')) clear();
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <HBtn onClick={() => { window.location.href = `?view=select&floor_id=${planId}`; }}
        title="Выбрать другой этаж" iconOnly>
        <IcoBack />
      </HBtn>

      {divider}

      <HBtn onClick={undo} disabled={!canUndo} title="Отменить (Ctrl+Z)" iconOnly>
        <IcoUndo />
      </HBtn>
      <HBtn onClick={redo} disabled={!canRedo} title="Повторить (Ctrl+Y)" iconOnly>
        <IcoRedo />
      </HBtn>

      {divider}

      <HBtn onClick={handleSave} title={`Сохранить план #${planId} на сервере`}>
        <IcoSave />
        Сохранить
      </HBtn>
      <HBtn onClick={handleLoad} title={`Загрузить план #${planId} с сервера`}>
        <IcoLoad />
        Загрузить
      </HBtn>

      {divider}

      <HBtn onClick={handleClear} danger title="Очистить всё">
        <IcoTrash />
        Очистить
      </HBtn>
    </div>
  );
};
