import React, { useEffect, useRef, useState } from 'react';
import { Point } from '../types';
import { useEditorStore } from '../store/editorStore';

interface Props {
  point: Point;
  onClose: () => void;
}

export function NodeEditPanel({ point, onClose }: Props) {
  const { updateNode } = useEditorStore();
  const nameRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(point.name ?? '');
  const [lat, setLat]   = useState(point.lat != null ? String(point.lat) : '');
  const [lon, setLon]   = useState(point.lon != null ? String(point.lon) : '');

  useEffect(() => {
    setName(point.name ?? '');
    setLat(point.lat != null ? String(point.lat) : '');
    setLon(point.lon != null ? String(point.lon) : '');
  }, [point.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    nameRef.current?.focus({ preventScroll: true });
  }, [point.id]);

  const save = () => {
    const parsedLat = lat.trim() !== '' ? parseFloat(lat) : undefined;
    const parsedLon = lon.trim() !== '' ? parseFloat(lon) : undefined;
    updateNode(point.id, {
      name: name.trim() || undefined,
      lat: !isNaN(parsedLat!) ? parsedLat : undefined,
      lon: !isNaN(parsedLon!) ? parsedLon : undefined,
    });
    onClose();
  };

  const isExit = point.node_type === 'exit';

  return (
    <div style={{
      position: 'absolute',
      left: point.x + 16,
      top: point.y - 8,
      transform: 'translateY(-50%)',
      zIndex: 500, background: '#fff', border: '1px solid #E5E7EB',
      borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.14)',
      padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
      minWidth: 260,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          Узел · <span style={{ color: '#6B7280', fontWeight: 400 }}>{point.node_type}</span>
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#6B7280' }}>✕</button>
      </div>

      <div>
        <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 3 }}>Название</div>
        <input
          ref={nameRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onClose(); }}
          style={{ width: '100%', padding: '6px 8px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 6, boxSizing: 'border-box' }}
        />
      </div>

      {isExit && (
        <>
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 2 }}>
            GPS-координаты выхода (для уличной навигации)
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 2 }}>Широта</div>
              <input
                value={lat}
                onChange={e => setLat(e.target.value)}
                placeholder="55.7654"
                style={{ width: '100%', padding: '6px 8px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 6, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 2 }}>Долгота</div>
              <input
                value={lon}
                onChange={e => setLon(e.target.value)}
                placeholder="37.6842"
                style={{ width: '100%', padding: '6px 8px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 6, boxSizing: 'border-box' }}
              />
            </div>
          </div>
          {lat && lon && (
            <a
              href={`https://yandex.ru/maps/?pt=${lon},${lat}&z=18`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 11, color: '#2563EB', textDecoration: 'none' }}
            >
              ↗ Проверить на карте
            </a>
          )}
        </>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={save}
          style={{ flex: 1, padding: '7px 0', fontSize: 13, fontWeight: 600, background: '#2563EB', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          Сохранить
        </button>
        <button
          onClick={onClose}
          style={{ padding: '7px 12px', fontSize: 13, background: '#F3F4F6', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#374151' }}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
