import React, { useRef, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import { uploadPlanImage, patchPlanDimensions } from '../api';

interface ImageUploadProps {
  planId: number;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({ planId }) => {
  const { image, setImage, setRealDimensions, setResolution, realWidth, realHeight, resolution } =
    useEditorStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset file input when image is cleared from store
  useEffect(() => {
    if (!image && fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [image]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Use a local object URL only to read image dimensions for aspect-ratio adjustment.
    // The actual image is uploaded to the server — we store its URL, not base64.
    const localUrl = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = async () => {
      URL.revokeObjectURL(localUrl);
      const aspectRatio = img.height / img.width;
      setRealDimensions(realWidth, Math.round(realWidth * aspectRatio * 100) / 100);
      try {
        const { photo_url } = await uploadPlanImage(planId, file);
        setImage(photo_url);
      } catch (err) {
        alert(`Ошибка загрузки изображения: ${(err as Error).message}`);
      }
    };
    img.src = localUrl;
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

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

  const sectionTitle = (text: string) => (
    <div style={{
      fontSize: '11px',
      fontWeight: '600',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.6px',
      color: '#9CA3AF',
      marginBottom: '10px',
    }}>
      {text}
    </div>
  );

  const fieldLabel = (text: string) => (
    <label style={{ display: 'block', fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>
      {text}
    </label>
  );

  return (
    <div style={{ padding: '12px 14px', borderBottom: '1px solid #F3F4F6' }}>
      {sectionTitle('Изображение')}

      <div style={{ marginBottom: '10px' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          onChange={handleImageUpload}
          style={{ display: 'none' }}
          id="image-upload-input"
        />
        <label
          htmlFor="image-upload-input"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            width: '100%',
            padding: '7px',
            border: '1px dashed #D1D5DB',
            borderRadius: '6px',
            background: image ? '#EFF6FF' : '#F9FAFB',
            color: image ? '#1D4ED8' : '#6B7280',
            fontSize: '13px',
            cursor: 'pointer',
            boxSizing: 'border-box',
            transition: 'background 0.15s',
          }}
        >
          {image ? '🖼 Изображение загружено' : '📸 Загрузить фон'}
        </label>
        {image && (
          <button
            onClick={() => setImage(null)}
            style={{
              marginTop: '5px',
              width: '100%',
              padding: '4px',
              border: '1px solid #FCA5A5',
              borderRadius: '5px',
              background: '#FEF2F2',
              color: '#DC2626',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Удалить изображение
          </button>
        )}
      </div>

      <div style={{ height: '1px', background: '#F3F4F6', margin: '12px 0' }} />
      {sectionTitle('Размеры холста')}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
        <div>
          {fieldLabel('Ширина (м)')}
          <input
            type="number" min="1" value={realWidth}
            onChange={(e) => setRealDimensions(Number(e.target.value), realHeight)}
            onBlur={(e) => patchPlanDimensions(planId, { real_width: Number(e.target.value), real_height: realHeight, resolution })}
            style={inputStyle}
          />
        </div>
        <div>
          {fieldLabel('Высота (м)')}
          <input
            type="number" min="1" value={realHeight}
            onChange={(e) => setRealDimensions(realWidth, Number(e.target.value))}
            onBlur={(e) => patchPlanDimensions(planId, { real_width: realWidth, real_height: Number(e.target.value), resolution })}
            style={inputStyle}
          />
        </div>
      </div>
      <div>
        {fieldLabel('Разрешение (px/м)')}
        <input
          type="number" min="1" value={resolution}
          onChange={(e) => setResolution(Number(e.target.value))}
          onBlur={(e) => patchPlanDimensions(planId, { real_width: realWidth, real_height: realHeight, resolution: Number(e.target.value) })}
          style={inputStyle}
        />
      </div>
    </div>
  );
};
