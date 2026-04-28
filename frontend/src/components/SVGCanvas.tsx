import React, { useRef, useState, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import { Point, NodeType } from '../types';
import { suggestNodeName } from '../utils';

// Visual style per node_type
const NODE_TYPE_COLOR: Record<NodeType, string> = {
  room:     '#007AFF',
  toilet:   '#06B6D4',
  stairs:   '#AF52DE',
  elevator: '#34C759',
  exit:     '#FF3B30',
  corridor: '#5AC8FA',
  passage:  '#F59E0B',
};

// Render the correct shape for a nav-node (called inside <svg>)
function NavNode({
  point,
  r,
  fill,
  stroke,
  cursor,
  onClick,
  onMouseDown,
}: {
  point: Point;
  r: number;
  fill: string;
  stroke: string;
  cursor: string;
  onClick: (e: React.MouseEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const { x, y } = point;
  const props = { fill, stroke, strokeWidth: 1.5, cursor, onClick, onMouseDown };

  switch (point.node_type) {
    case 'elevator': {
      const s = r * 1.6;
      return <rect x={x - s / 2} y={y - s / 2} width={s} height={s} rx={2} {...props} />;
    }
    case 'stairs': {
      // Upward-pointing triangle
      const pts = `${x},${y - r * 1.4} ${x - r * 1.2},${y + r * 0.9} ${x + r * 1.2},${y + r * 0.9}`;
      return <polygon points={pts} {...props} />;
    }
    case 'toilet': {
      // Cross / plus shape
      const a = r * 0.45, b = r * 1.3;
      const pts = `${x-a},${y-b} ${x+a},${y-b} ${x+a},${y-a} ${x+b},${y-a} ${x+b},${y+a} ${x+a},${y+a} ${x+a},${y+b} ${x-a},${y+b} ${x-a},${y+a} ${x-b},${y+a} ${x-b},${y-a} ${x-a},${y-a}`;
      return <polygon points={pts} {...props} />;
    }
    case 'corridor': {
      return <circle cx={x} cy={y} r={r * 0.65} {...props} />;
    }
    case 'passage': {
      // Hexagon — visually distinct from stairs/elevator
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        return `${x + r * 1.2 * Math.cos(a)},${y + r * 1.2 * Math.sin(a)}`;
      }).join(' ');
      return <polygon points={pts} {...props} />;
    }
    default:
      return <circle cx={x} cy={y} r={r} {...props} />;
  }
}

export const SVGCanvas: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const store = useEditorStore();
  const {
    points,
    connections,
    polygons,
    polygonPoints,
    previewPoint,
    selectedPoints,
    measurementSegments,
    mode,
    settings,
    image,
    realWidth,
    realHeight,
    resolution,
    nodeTypeToCreate,
    floorName,
    addPoint,
    setPreviewPoint,
    addPolygonPoint,
    finishPolygon,
    removePoint,
    removePolygon,
    renamePoint,
    renamePolygon,
    addConnection,
    removeConnection,
    movePoint,
    movePolygonVertex,
    setSelectedPoints,
    setEditingPolygonIndex,
    addMeasurementSegment,
    bindingPolygonIndex,
    setBindingPolygonIndex,
    toggleEntryNode,
    autoConnectCorridor,
    lastCorridorNodeId,
    setLastCorridorNodeId,
  } = store;

  const CLOSE_SNAP_RADIUS = 12;

  // Edit mode drag state — nav-nodes
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Edit mode drag state — polygon vertices
  const [draggingVertex, setDraggingVertex] = useState<{ polyIdx: number; vtxIdx: number } | null>(null);
  const isDragging = useRef(false);

  // Measure mode: first click anchor
  const [measureStart, setMeasureStart] = useState<{ x: number; y: number } | null>(null);

  // Polygon mode: snap-to-close indicator
  const [isNearFirst, setIsNearFirst] = useState(false);

  const svgWidth  = realWidth  * resolution;
  const svgHeight = realHeight * resolution;

  useEffect(() => {
    setDraggingId(null);
    isDragging.current = false;
    if (mode !== 'connect') setSelectedPoints([]);
    if (mode !== 'measure') setMeasureStart(null);
    if (mode !== 'polygon') setIsNearFirst(false);
    if (mode !== 'bind') setBindingPolygonIndex(null);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Coordinate helpers ----

  const getSVGCoords = (e: React.MouseEvent): { x: number; y: number } => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const cursorPt = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: cursorPt.x, y: cursorPt.y };
  };

  // ---- SVG-level handlers ----

  const handleSVGClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || isDragging.current) return;
    const { x, y } = getSVGCoords(e);

    if (mode === 'bind') {
      setBindingPolygonIndex(null);
      return;
    }
    if (mode === 'create') {
      const suggested = suggestNodeName(nodeTypeToCreate, points, floorName);
      let name = suggested;
      if (settings.askNames) {
        const result = prompt('Введите название точки:', suggested);
        if (result === null) return;
        name = result;
      }
      addPoint({ x, y, name, node_type: nodeTypeToCreate });
      if (name && nodeTypeToCreate === 'passage') {
        finishPolygon([], name);
      }
      if (autoConnectCorridor && nodeTypeToCreate === 'corridor') {
        const newPoints = useEditorStore.getState().points;
        const newNode = newPoints[newPoints.length - 1];
        if (lastCorridorNodeId) {
          addConnection(lastCorridorNodeId, newNode.id);
        }
        setLastCorridorNodeId(newNode.id);
      }
    } else if (mode === 'polygon') {
      if (isNearFirst && polygonPoints.length >= 3) {
        let name = '';
        if (settings.askNames) {
          const result = prompt('Название полигона:');
          if (result === null) return;
          name = result;
        }
        finishPolygon(polygonPoints, name);
        setIsNearFirst(false);
      } else {
        addPolygonPoint({ x, y });
      }
    } else if (mode === 'connect') {
      setSelectedPoints([]);
    } else if (mode === 'measure') {
      if (!measureStart) {
        setMeasureStart({ x, y });
      } else {
        addMeasurementSegment(measureStart, { x, y });
        setMeasureStart(null);
      }
    }
  };

  const handleSVGMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const { x, y } = getSVGCoords(e);

    if (mode === 'create' || mode === 'polygon' || mode === 'measure') {
      setPreviewPoint({ x, y });
    }

    if (draggingId !== null && mode === 'edit') {
      isDragging.current = true;
      movePoint(draggingId, { x, y });
    }

    if (draggingVertex !== null && mode === 'edit') {
      isDragging.current = true;
      movePolygonVertex(draggingVertex.polyIdx, draggingVertex.vtxIdx, { x, y });
    }

    if (mode === 'polygon' && polygonPoints.length >= 3) {
      const first = polygonPoints[0];
      const dist = Math.sqrt((x - first.x) ** 2 + (y - first.y) ** 2);
      setIsNearFirst(dist <= CLOSE_SNAP_RADIUS);
    } else {
      setIsNearFirst(false);
    }
  };

  const stopDrag = () => {
    if (draggingId !== null || draggingVertex !== null) {
      store.saveHistory();
      setDraggingId(null);
      setDraggingVertex(null);
      setTimeout(() => { isDragging.current = false; }, 0);
    }
  };

  // ---- Point handlers ----

  const handlePointMouseDown = (e: React.MouseEvent, id: string) => {
    if (mode !== 'edit') return;
    e.stopPropagation();
    e.preventDefault();
    isDragging.current = false;
    setDraggingId(id);
  };

  const handlePointClick = (e: React.MouseEvent, point: Point) => {
    e.stopPropagation();
    if (isDragging.current) return;

    if (mode === 'bind') {
      const bindable = point.node_type !== 'corridor' && point.node_type !== 'passage';
      if (bindingPolygonIndex !== null && bindable) {
        toggleEntryNode(bindingPolygonIndex, point.id);
      }
      return;
    }
    if (mode === 'edit') {
      const current = point.name ?? '';
      const result = prompt('Название точки:', current);
      if (result !== null) renamePoint(point.id, result);
    } else if (mode === 'delete') {
      removePoint(point.id);
    } else if (mode === 'connect') {
      if (selectedPoints.length === 0) {
        setSelectedPoints([point.id]);
      } else if (selectedPoints[0] === point.id) {
        setSelectedPoints([]);
      } else {
        const from_id = selectedPoints[0];
        const to_id   = point.id;
        const alreadyConnected = connections.some(
          c => (c.from_id === from_id && c.to_id === to_id) ||
               (c.from_id === to_id   && c.to_id === from_id)
        );
        alreadyConnected ? removeConnection(from_id, to_id) : addConnection(from_id, to_id);
        setSelectedPoints([]);
      }
    }
  };

  // ---- Connection handlers ----

  const handleConnectionClick = (e: React.MouseEvent, from_id: string, to_id: string) => {
    e.stopPropagation();
    if (mode === 'delete') removeConnection(from_id, to_id);
  };

  // ---- Polygon handlers ----

  const handlePolygonClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (mode === 'bind') {
      setBindingPolygonIndex(bindingPolygonIndex === index ? null : index);
    } else if (mode === 'edit') {
      setEditingPolygonIndex(index);
    } else if (mode === 'delete') {
      removePolygon(index);
    }
  };

  // ---- Cursor ----

  const svgCursor =
    mode === 'polygon' && isNearFirst ? 'pointer' :
    mode === 'create' || mode === 'polygon' || mode === 'measure' ? 'crosshair' :
    mode === 'edit' && draggingId !== null ? 'grabbing' :
    mode === 'bind' ? 'pointer' :
    'default';

  // ---- Distance helper ----

  const pxToMeters = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const dist = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
    return (dist / resolution).toFixed(2);
  };

  return (
    <svg
      ref={svgRef}
      width={svgWidth}
      height={svgHeight}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      onClick={handleSVGClick}
      onMouseMove={handleSVGMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
      style={{
        width: svgWidth,
        height: svgHeight,
        flexShrink: 0,
        border: '1px solid #D1D5DB',
        background: '#fff',
        cursor: svgCursor,
        display: 'block',
        borderRadius: '4px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background image */}
      {image && (
        <image
          href={image}
          x={0} y={0}
          width={svgWidth} height={svgHeight}
          preserveAspectRatio="none"
        />
      )}

      {/* Polygons */}
      {polygons.map((poly, idx) => {
        const deletable      = mode === 'delete';
        const editable       = mode === 'edit';
        const bindSelected   = mode === 'bind' && bindingPolygonIndex === idx;
        const bindable       = mode === 'bind';
        const stroke = deletable ? '#DC2626' : bindSelected ? '#F59E0B' : settings.polygonStrokeColor;
        return (
          <g key={`poly-${idx}`}>
            <polygon
              points={poly.points.map(p => `${p.x},${p.y}`).join(' ')}
              fill={settings.polygonFillColor}
              stroke={stroke}
              strokeWidth={bindSelected ? 3 : 2}
              fillOpacity={settings.polygonOpacity}
              style={{ cursor: deletable || editable || bindable ? 'pointer' : 'default' }}
              onClick={(e) => handlePolygonClick(e, idx)}
            />
            {poly.name && (
              <text
                x={poly.points.reduce((s, p) => s + p.x, 0) / poly.points.length}
                y={poly.points.reduce((s, p) => s + p.y, 0) / poly.points.length}
                fontSize="16" fontWeight="bold"
                fill={settings.polygonStrokeColor}
                textAnchor="middle" pointerEvents="none"
              >
                {poly.name}
              </text>
            )}
            {poly.points.map((pt, pidx) => (
              <circle
                key={`vertex-${idx}-${pidx}`}
                cx={pt.x} cy={pt.y}
                r={settings.polygonVertexRadius + (editable ? 2 : 0)}
                fill={settings.polygonVertexColor}
                cursor={editable ? (draggingVertex?.polyIdx === idx && draggingVertex?.vtxIdx === pidx ? 'grabbing' : 'grab') : 'default'}
                onMouseDown={editable ? (e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  isDragging.current = false;
                  setDraggingVertex({ polyIdx: idx, vtxIdx: pidx });
                } : undefined}
              />
            ))}
          </g>
        );
      })}

      {/* Connections */}
      {connections.map((conn) => {
        const from = points.find(p => p.id === conn.from_id);
        const to   = points.find(p => p.id === conn.to_id);
        if (!from || !to) return null;
        const deletable = mode === 'delete';
        return (
          <g key={`conn-${conn.from_id}-${conn.to_id}`}>
            {deletable && (
              <line
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke="transparent"
                strokeWidth={Math.max(settings.lineWidth, 12)}
                cursor="pointer"
                onClick={(e) => handleConnectionClick(e, conn.from_id, conn.to_id)}
              />
            )}
            <line
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              stroke={deletable ? '#DC2626' : settings.lineColor}
              strokeWidth={settings.lineWidth}
              pointerEvents="none"
            />
          </g>
        );
      })}

      {/* Measurement segments */}
      {measurementSegments.map((seg, idx) => {
        const mx = (seg.from.x + seg.to.x) / 2;
        const my = (seg.from.y + seg.to.y) / 2;
        return (
          <g key={`measure-${idx}`}>
            <line
              x1={seg.from.x} y1={seg.from.y} x2={seg.to.x} y2={seg.to.y}
              stroke="#16A34A" strokeWidth="2" strokeDasharray="6 3" pointerEvents="none"
            />
            <circle cx={seg.from.x} cy={seg.from.y} r={4} fill="#16A34A" pointerEvents="none" />
            <circle cx={seg.to.x}   cy={seg.to.y}   r={4} fill="#16A34A" pointerEvents="none" />
            <text x={mx} y={my - 8} fontSize="13" fill="#16A34A" textAnchor="middle" pointerEvents="none">
              {pxToMeters(seg.from, seg.to)} м
            </text>
          </g>
        );
      })}

      {/* Measurement preview */}
      {mode === 'measure' && measureStart && previewPoint && (
        <g>
          <line
            x1={measureStart.x} y1={measureStart.y}
            x2={previewPoint.x} y2={previewPoint.y}
            stroke="#16A34A" strokeWidth="2" strokeDasharray="6 3" pointerEvents="none"
          />
          <circle cx={measureStart.x} cy={measureStart.y} r={4} fill="#16A34A" pointerEvents="none" />
          <text
            x={(measureStart.x + previewPoint.x) / 2}
            y={(measureStart.y + previewPoint.y) / 2 - 8}
            fontSize="13" fill="#16A34A" textAnchor="middle" pointerEvents="none"
          >
            {pxToMeters(measureStart, previewPoint)} м
          </text>
        </g>
      )}

      {/* Binding lines: polygon centroid → entry nav-nodes */}
      {polygons.map((poly, idx) => {
        if (!poly.nav_node_client_ids?.length) return null;
        const cx = poly.points.reduce((s, p) => s + p.x, 0) / poly.points.length;
        const cy = poly.points.reduce((s, p) => s + p.y, 0) / poly.points.length;
        const isSelected = mode === 'bind' && bindingPolygonIndex === idx;
        return (
          <g key={`bind-lines-${idx}`} pointerEvents="none">
            {poly.nav_node_client_ids.map(nodeId => {
              const node = points.find(p => p.id === nodeId);
              if (!node) return null;
              return (
                <line
                  key={`bind-${idx}-${nodeId}`}
                  x1={cx} y1={cy} x2={node.x} y2={node.y}
                  stroke={isSelected ? '#F59E0B' : '#94A3B8'}
                  strokeWidth={isSelected ? 2 : 1}
                  strokeDasharray="5 3"
                  opacity={isSelected ? 1 : 0.45}
                />
              );
            })}
          </g>
        );
      })}

      {/* Points (nav-nodes) */}
      {points.map((point) => {
        const isSelected    = mode === 'connect' && selectedPoints.includes(point.id);
        const isDraggingThis = draggingId === point.id;
        const fill          = isSelected ? '#2563EB' : (NODE_TYPE_COLOR[point.node_type] || settings.pointColor);
        const stroke        = isSelected ? '#fff' : settings.pointStrokeColor;
        const nodeCursor    = mode === 'edit' ? (isDraggingThis ? 'grabbing' : 'grab') : 'pointer';
        const r             = settings.pointRadius;

        const isBound = mode === 'bind' && bindingPolygonIndex !== null &&
          (polygons[bindingPolygonIndex]?.nav_node_client_ids ?? []).includes(point.id);
        const isBindableRoom = mode === 'bind' && bindingPolygonIndex !== null &&
          point.node_type !== 'corridor' && point.node_type !== 'passage' && !isBound;

        return (
          <g key={`point-${point.id}`}>
            {/* Selection ring (connect mode) */}
            {isSelected && (
              <circle cx={point.x} cy={point.y} r={r + 6}
                fill="none" stroke="#2563EB" strokeWidth="2" pointerEvents="none" />
            )}
            {/* Bound entry-node ring (bind mode) */}
            {isBound && (
              <circle cx={point.x} cy={point.y} r={r + 6}
                fill="none" stroke="#F59E0B" strokeWidth="2.5" pointerEvents="none" />
            )}
            {/* Bindable-but-not-yet-bound hint ring */}
            {isBindableRoom && (
              <circle cx={point.x} cy={point.y} r={r + 5}
                fill="none" stroke="#10B981" strokeWidth="1.5" strokeDasharray="3 2" pointerEvents="none" />
            )}
            <NavNode
              point={point} r={r} fill={fill} stroke={stroke} cursor={nodeCursor}
              onClick={(e) => handlePointClick(e, point)}
              onMouseDown={(e) => handlePointMouseDown(e, point.id)}
            />
            {/* Label */}
            {settings.askNames && point.name && (
              <text
                x={point.x + r + 4} y={point.y - 4}
                fontSize="14" fill={fill} pointerEvents="none"
              >
                {point.name}
              </text>
            )}
          </g>
        );
      })}

      {/* Polygon being drawn */}
      {mode === 'polygon' && polygonPoints.length > 0 && (
        <g>
          <polygon
            points={polygonPoints.map(p => `${p.x},${p.y}`).join(' ')}
            fill={settings.polygonFillColor}
            stroke={settings.polygonStrokeColor}
            strokeWidth="2"
            fillOpacity={settings.polygonOpacity}
            opacity="0.5"
          />
          {polygonPoints.map((pt, idx) => {
            const isFirst   = idx === 0 && polygonPoints.length >= 3;
            const snapActive = isFirst && isNearFirst;
            return (
              <g key={`preview-vertex-${idx}`}>
                {isFirst && (
                  <circle
                    cx={pt.x} cy={pt.y}
                    r={settings.polygonVertexRadius + (snapActive ? 7 : 4)}
                    fill="none" stroke="#16A34A" strokeWidth="2"
                    opacity={snapActive ? 1 : 0.5} pointerEvents="none"
                  />
                )}
                <circle
                  cx={pt.x} cy={pt.y}
                  r={settings.polygonVertexRadius}
                  fill={isFirst ? '#16A34A' : settings.polygonVertexColor}
                  pointerEvents="none"
                />
              </g>
            );
          })}
        </g>
      )}

      {/* Ghost cursor — create / polygon (hidden when snapping to first vertex) */}
      {previewPoint && (mode === 'create' || mode === 'polygon') && !isNearFirst && (
        <circle
          cx={previewPoint.x} cy={previewPoint.y}
          r={settings.pointRadius}
          fill={settings.pointColor}
          opacity="0.5" pointerEvents="none"
        />
      )}

      {/* Ghost cursor — measure (before first click) */}
      {previewPoint && mode === 'measure' && !measureStart && (
        <circle
          cx={previewPoint.x} cy={previewPoint.y}
          r={4} fill="#16A34A" opacity="0.6" pointerEvents="none"
        />
      )}
    </svg>
  );
};
