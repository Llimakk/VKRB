import React from 'react';
import { useEditorStore } from '../store/editorStore';

const label = (text: string) => (
  <label style={{ display: 'block', fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>
    {text}
  </label>
);

const row = (children: React.ReactNode) => (
  <div style={{ marginBottom: '10px' }}>{children}</div>
);

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '5px 8px',
  border: '1px solid #D1D5DB',
  borderRadius: '5px',
  fontSize: '13px',
  color: '#111827',
  background: '#fff',
  boxSizing: 'border-box',
};

const colorStyle: React.CSSProperties = {
  width: '100%',
  height: '32px',
  border: '1px solid #D1D5DB',
  borderRadius: '5px',
  cursor: 'pointer',
  padding: '1px',
  background: '#fff',
  boxSizing: 'border-box',
};

const sectionTitle = (text: string) => (
  <div style={{
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.6px',
    color: '#9CA3AF',
    marginBottom: '10px',
    marginTop: '4px',
  }}>
    {text}
  </div>
);

export const Settings: React.FC = () => {
  const { settings, updateSettings } = useEditorStore();

  return (
    <div style={{ padding: '12px 14px' }}>

      {sectionTitle('Точки')}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
        <div>
          {label('Радиус')}
          <input
            type="number" min="1" value={settings.pointRadius}
            onChange={(e) => updateSettings({ pointRadius: Number(e.target.value) })}
            style={inputStyle}
          />
        </div>
        <div>
          {label('Заливка')}
          <input
            type="color" value={settings.pointColor}
            onChange={(e) => updateSettings({ pointColor: e.target.value })}
            style={colorStyle}
          />
        </div>
        <div>
          {label('Обводка')}
          <input
            type="color" value={settings.pointStrokeColor}
            onChange={(e) => updateSettings({ pointStrokeColor: e.target.value })}
            style={colorStyle}
          />
        </div>
      </div>

      <div style={{ height: '1px', background: '#F3F4F6', margin: '12px 0' }} />
      {sectionTitle('Связи')}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
        <div>
          {label('Толщина')}
          <input
            type="number" min="1" value={settings.lineWidth}
            onChange={(e) => updateSettings({ lineWidth: Number(e.target.value) })}
            style={inputStyle}
          />
        </div>
        <div>
          {label('Цвет')}
          <input
            type="color" value={settings.lineColor}
            onChange={(e) => updateSettings({ lineColor: e.target.value })}
            style={colorStyle}
          />
        </div>
      </div>

      <div style={{ height: '1px', background: '#F3F4F6', margin: '12px 0' }} />
      {sectionTitle('Полигон помещения')}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
        <div>
          {label('Р. вершины')}
          <input
            type="number" min="1" value={settings.polygonVertexRadius}
            onChange={(e) => updateSettings({ polygonVertexRadius: Number(e.target.value) })}
            style={inputStyle}
          />
        </div>
        <div>
          {label('Вершины')}
          <input
            type="color" value={settings.polygonVertexColor}
            onChange={(e) => updateSettings({ polygonVertexColor: e.target.value })}
            style={colorStyle}
          />
        </div>
        <div>
          {label('Заливка')}
          <input
            type="color" value={settings.polygonFillColor}
            onChange={(e) => updateSettings({ polygonFillColor: e.target.value })}
            style={colorStyle}
          />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          {label('Рёбра')}
          <input
            type="color" value={settings.polygonStrokeColor}
            onChange={(e) => updateSettings({ polygonStrokeColor: e.target.value })}
            style={colorStyle}
          />
        </div>
      </div>
      {row(
        <>
          {label(`Прозрачность: ${Math.round(settings.polygonOpacity * 100)}%`)}
          <input
            type="range" min="0" max="1" step="0.05"
            value={settings.polygonOpacity}
            onChange={(e) => updateSettings({ polygonOpacity: Number(e.target.value) })}
            style={{ width: '100%', accentColor: '#2563EB' }}
          />
        </>
      )}

      <div style={{ height: '1px', background: '#F3F4F6', margin: '12px 0' }} />
      {sectionTitle('Общее')}
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#374151' }}>
        <input
          type="checkbox"
          checked={settings.askNames}
          onChange={(e) => updateSettings({ askNames: e.target.checked })}
          style={{ accentColor: '#2563EB', width: '14px', height: '14px' }}
        />
        Задавать названия элементам
      </label>
    </div>
  );
};
