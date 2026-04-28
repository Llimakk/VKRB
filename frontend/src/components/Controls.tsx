import React from 'react';
import { useEditorStore } from '../store/editorStore';
import { loadPlanGraph, savePlanGraph } from '../api';

interface ControlsProps {
  planId: number;
}

export const Controls: React.FC<ControlsProps> = ({ planId }) => {
  const store = useEditorStore();
  const { undo, redo, clear, exportForServer, loadFromServer, historyIndex, history } = store;

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const handleLoad = async () => {
    try {
      const data = await loadPlanGraph(planId);
      loadFromServer(data);
    } catch (err) {
      alert(`Ошибка загрузки: ${(err as Error).message}`);
    }
  };

  const handleSave = async () => {
    try {
      const payload = exportForServer();
      const saved = await savePlanGraph(planId, payload);
      // Reload with real DB ids so the next save doesn't recreate everything
      loadFromServer(saved);
    } catch (err) {
      alert(`Ошибка сохранения: ${(err as Error).message}`);
    }
  };

  const handleClear = () => {
    if (window.confirm('Очистить всё? Это действие нельзя отменить.')) clear();
  };

  const btn = (
    label: string,
    onClick: () => void,
    opts: { disabled?: boolean; variant?: 'default' | 'danger'; title?: string } = {}
  ) => {
    const { disabled = false, variant = 'default', title } = opts;
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        title={title}
        style={{
          height: '30px',
          padding: '0 10px',
          border: '1px solid',
          borderColor: variant === 'danger' ? '#FCA5A5' : disabled ? '#E5E7EB' : '#D1D5DB',
          borderRadius: '5px',
          background: variant === 'danger' ? '#FEF2F2' : disabled ? '#F9FAFB' : '#FFFFFF',
          color: variant === 'danger' ? '#DC2626' : disabled ? '#9CA3AF' : '#374151',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: '13px',
          fontWeight: '500',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          whiteSpace: 'nowrap' as const,
          transition: 'background 0.15s, border-color 0.15s',
          userSelect: 'none' as const,
        }}
      >
        {label}
      </button>
    );
  };

  const divider = (
    <div style={{ width: '1px', height: '20px', background: '#E5E7EB', flexShrink: 0 }} />
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      {/* Home — back to floor selector */}
      <button
        onClick={() => { window.location.href = `?view=select&floor_id=${planId}`; }}
        title="Выбрать другой этаж"
        style={{
          height: '30px', padding: '0 8px',
          border: '1px solid #E5E7EB', borderRadius: '5px',
          background: '#fff', color: '#6B7280',
          cursor: 'pointer', fontSize: '16px', lineHeight: 1,
          display: 'inline-flex', alignItems: 'center',
        }}
      >
        ←
      </button>

      {divider}

      {/* Undo / Redo */}
      {btn('↶', undo, { disabled: !canUndo, title: 'Отменить (Ctrl+Z)' })}
      {btn('↷', redo, { disabled: !canRedo, title: 'Повторить (Ctrl+Y)' })}

      {divider}

      {/* API ops */}
      {btn('💾 Сохранить', handleSave, { title: `Сохранить план #${planId} на сервере` })}
      {btn('📂 Загрузить', handleLoad, { title: `Загрузить план #${planId} с сервера` })}

      {divider}

      {btn('🗑 Очистить', handleClear, { variant: 'danger', title: 'Очистить всё' })}
    </div>
  );
};
