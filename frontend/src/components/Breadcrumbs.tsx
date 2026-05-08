import React, { useState, useCallback } from 'react';
import { Breadcrumb, TreeCampus, renameBreadcrumb } from '../api';

interface Props {
  breadcrumbs: Breadcrumb[];
  tree: TreeCampus[];
  onChange: (updated: Breadcrumb[]) => void;
}

// Keys used to descend one level into the tree at each breadcrumb depth.
const CHILD_KEYS = ['buildings', 'structures', 'floors'] as const;

// Query-param names for the select-view URL, indexed by breadcrumb depth.
const PARAM_KEYS = ['campus_id', 'building_id', 'structure_id'] as const;

function getSiblings(
  index: number,
  breadcrumbs: Breadcrumb[],
  tree: TreeCampus[],
): Array<{ id: number; name: string; sort_order?: number }> {
  if (!tree.length || !breadcrumbs.length) return [];

  // Walk down the tree following the current breadcrumb path to reach level `index`.
  let current: Array<Record<string, unknown>> = tree as Array<Record<string, unknown>>;
  for (let i = 0; i < index; i++) {
    const node = current.find(item => item.id === breadcrumbs[i].id);
    if (!node) return [];
    current = (node[CHILD_KEYS[i]] as Array<Record<string, unknown>>) ?? [];
  }

  const isFloorLevel = index === breadcrumbs.length - 1;
  if (isFloorLevel) {
    return [...(current as Array<{ id: number; name: string; sort_order?: number }>)]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }
  return current as Array<{ id: number; name: string }>;
}

function navigateSibling(index: number, id: number, breadcrumbs: Breadcrumb[]) {
  const isFloorLevel = index === breadcrumbs.length - 1;
  if (isFloorLevel) {
    window.location.href = `?floor_id=${id}`;
    return;
  }
  const p = new URLSearchParams({ view: 'select' });
  // Preserve all ancestor params up to (not including) this level.
  breadcrumbs.slice(0, index).forEach((c, i) => p.set(PARAM_KEYS[i], String(c.id)));
  p.set(PARAM_KEYS[index], String(id));
  window.location.href = `?${p.toString()}`;
}

export function Breadcrumbs({ breadcrumbs, tree, onChange }: Props) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditingValue(breadcrumbs[index].name);
    setOpenDropdown(null);
  };

  // Single handler shared by Enter keydown and onBlur — no duplication.
  const commitRename = useCallback(async (index: number, name: string) => {
    setEditingIndex(null);
    const crumb = breadcrumbs[index];
    if (!name || name === crumb.name) return;
    await renameBreadcrumb(crumb.level, crumb.id, name);
    onChange(breadcrumbs.map((c, j) => (j === index ? { ...c, name } : c)));
  }, [breadcrumbs, onChange]);

  if (!breadcrumbs.length) return null;

  return (
    <span style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
      {breadcrumbs.map((crumb, i) => {
        const siblings  = getSiblings(i, breadcrumbs, tree);
        const isLast    = i === breadcrumbs.length - 1;
        const isOpen    = openDropdown === i;
        const isHovered = hoveredIndex === i;
        const canSwitch = siblings.length > 1;

        return (
          <React.Fragment key={crumb.id}>
            {i > 0 && <span style={{ color: '#D1D5DB' }}>›</span>}

            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 2 }}>

              {editingIndex === i ? (
                <input
                  autoFocus
                  value={editingValue}
                  onChange={e => setEditingValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  commitRename(i, editingValue.trim());
                    if (e.key === 'Escape') setEditingIndex(null);
                  }}
                  onBlur={() => commitRename(i, editingValue.trim())}
                  style={{
                    fontSize: 13, fontWeight: isLast ? 600 : 400,
                    border: 'none', borderBottom: '1px solid #2563EB', outline: 'none',
                    background: 'transparent', color: '#111827', padding: '0 2px',
                    width: `${Math.max(editingValue.length, 4)}ch`,
                  }}
                />
              ) : (
                <span
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}
                >
                  <button
                    onClick={() => canSwitch && setOpenDropdown(isOpen ? null : i)}
                    style={{
                      background: 'none', border: 'none', padding: '2px 4px', borderRadius: 4,
                      cursor: canSwitch ? 'pointer' : 'default',
                      color: isLast ? '#111827' : '#6B7280',
                      fontWeight: isLast ? 600 : 400,
                      fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 3,
                      transition: 'background 0.1s',
                      ...(isHovered && canSwitch ? { background: '#F3F4F6' } : {}),
                    }}
                  >
                    {crumb.name}
                    {canSwitch && (
                      <span style={{ fontSize: 8, color: '#9CA3AF', lineHeight: 1, marginTop: 1 }}>▾</span>
                    )}
                  </button>

                  <button
                    onClick={() => startEditing(i)}
                    title="Переименовать"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '1px 3px', borderRadius: 3, fontSize: 11, lineHeight: 1,
                      color: '#9CA3AF',
                      opacity: isHovered ? 1 : 0,
                      pointerEvents: isHovered ? 'auto' : 'none',
                      transition: 'opacity 0.15s',
                    }}
                  >
                    ✏️
                  </button>
                </span>
              )}

              {isOpen && canSwitch && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                    onClick={() => setOpenDropdown(null)}
                  />
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 1000,
                    background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                    minWidth: 180, maxHeight: 280, overflowY: 'auto', padding: '4px 0',
                  }}>
                    {siblings.map(s => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setOpenDropdown(null);
                          if (s.id !== crumb.id) navigateSibling(i, s.id, breadcrumbs);
                        }}
                        onMouseEnter={e => {
                          if (s.id !== crumb.id) e.currentTarget.style.background = '#F9FAFB';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = s.id === crumb.id ? '#EFF6FF' : 'transparent';
                        }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '7px 14px', border: 'none',
                          background: s.id === crumb.id ? '#EFF6FF' : 'transparent',
                          color: s.id === crumb.id ? '#2563EB' : '#111827',
                          fontWeight: s.id === crumb.id ? 600 : 400,
                          fontSize: 13, cursor: s.id === crumb.id ? 'default' : 'pointer',
                        }}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </>
              )}

            </span>
          </React.Fragment>
        );
      })}
    </span>
  );
}
