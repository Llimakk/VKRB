import React from 'react';
import { useEditorStore } from '../store/editorStore';

export const ZoomControls: React.FC = () => {
  const { zoomLevel, zoomIn, zoomOut, setZoomLevel } = useEditorStore();

  const btn: React.CSSProperties = {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: '#FFFFFF',
    color: '#374151',
    fontSize: '20px',
    fontWeight: '400',
    cursor: 'pointer',
    lineHeight: 1,
    userSelect: 'none',
    transition: 'background 0.12s',
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '16px',
        right: '16px',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        border: '1px solid #D1D5DB',
        zIndex: 20,
      }}
    >
      <button
        onClick={zoomIn}
        title="Увеличить масштаб"
        style={{ ...btn, borderBottom: '1px solid #E5E7EB' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#F3F4F6')}
        onMouseLeave={e => (e.currentTarget.style.background = '#FFFFFF')}
      >
        +
      </button>
      <button
        onClick={() => setZoomLevel(1)}
        title={`Масштаб: ${Math.round(zoomLevel * 100)}%`}
        style={{
          ...btn,
          fontSize: '10px',
          fontWeight: '600',
          color: '#6B7280',
          borderBottom: '1px solid #E5E7EB',
          cursor: zoomLevel === 1 ? 'default' : 'pointer',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#F3F4F6')}
        onMouseLeave={e => (e.currentTarget.style.background = '#FFFFFF')}
      >
        {Math.round(zoomLevel * 100)}%
      </button>
      <button
        onClick={zoomOut}
        title="Уменьшить масштаб"
        style={btn}
        onMouseEnter={e => (e.currentTarget.style.background = '#F3F4F6')}
        onMouseLeave={e => (e.currentTarget.style.background = '#FFFFFF')}
      >
        &minus;
      </button>
    </div>
  );
};
