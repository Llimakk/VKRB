import React, { useRef, useState, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import { Point } from '../types';
import { suggestNodeName } from '../utils';
import { RouteOverlay } from './RoutePreviewPanel';
import { NavNode } from './NavNode';
import { CANVAS_COLORS, NODE_TYPE_COLOR, NODE_RING_OFFSET, LABEL_FONT_SIZE } from '../constants';

interface SVGCanvasProps {
  routeOverlay?: RouteOverlay | null;
  onNodeEdit?: (point: Point) => void;
}

export const SVGCanvas: React.FC<SVGCanvasProps> = ({ routeOverlay, onNodeEdit }) => {
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
    addConnection,
    removeConnection,
    addWaypoint,
    moveWaypoint,
    removeWaypoint,
    movePoint,
    movePolygonVertex,
    setSelectedPoints,
    setEditingPolygonIndex,
    addMeasurementSegment,
    bindingPolygonIndex,
    setBindingPolygonIndex,
    toggleEntryNode,
    autoConnectCorridor,
    autoLinkCorridorToNonCorridor,
    lastCorridorNodeId,
    setLastCorridorNodeId,
  } = store;

  const CLOSE_SNAP_RADIUS = 12;
  const DRAG_THRESHOLD = 4; // px — minimum movement to treat as drag, not click

  // Edit mode drag state — nav-nodes
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Edit mode drag state — polygon vertices
  const [draggingVertex, setDraggingVertex] = useState<{ polyIdx: number; vtxIdx: number } | null>(null);
  const draggingVertexRef = useRef<{ polyIdx: number; vtxIdx: number } | null>(null);
  const draggingWaypointRef = useRef<{ fromId: string; toId: string; index: number } | null>(null);
  const isDragging = useRef(false);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);

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
    // Using getBoundingClientRect rather than getScreenCTM — bbox reliably includes
    // every CSS transform applied to ancestors (pan translate, zoom scale).
    const rect = svgRef.current.getBoundingClientRect();
    const sx = rect.width  > 0 ? svgWidth  / rect.width  : 1;
    const sy = rect.height > 0 ? svgHeight / rect.height : 1;
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top)  * sy,
    };
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
      const autoCorridorMode = autoConnectCorridor && nodeTypeToCreate === 'corridor';
      if (settings.askNames && !autoCorridorMode) {
        const result = prompt('Введите название точки:', suggested);
        if (result === null) return;
        name = result;
      }
      addPoint({ x, y, name, node_type: nodeTypeToCreate });
      if (name && nodeTypeToCreate === 'passage') {
        finishPolygon([], name);
      }
      if (autoConnectCorridor && nodeTypeToCreate === 'corridor') {
        // getState() needed: addPoint is batched by React, so the closure's `points`
        // doesn't yet contain the just-added node.
        const newPoints = useEditorStore.getState().points;
        const newNode = newPoints[newPoints.length - 1];
        if (lastCorridorNodeId) {
          addConnection(lastCorridorNodeId, newNode.id);
        }
        setLastCorridorNodeId(newNode.id);
      }
      if (autoLinkCorridorToNonCorridor && nodeTypeToCreate === 'corridor') {
        const newPoints = useEditorStore.getState().points;
        const newNode = newPoints[newPoints.length - 1];
        const nonCorridors = newPoints.filter(
          p => p.id !== newNode.id && p.node_type !== 'corridor'
        );
        if (nonCorridors.length > 0) {
          let nearest = nonCorridors[0];
          let nearestDist = Math.hypot(nearest.x - newNode.x, nearest.y - newNode.y);
          for (let i = 1; i < nonCorridors.length; i++) {
            const p = nonCorridors[i];
            const d = Math.hypot(p.x - newNode.x, p.y - newNode.y);
            if (d < nearestDist) { nearest = p; nearestDist = d; }
          }
          addConnection(newNode.id, nearest.id);
        }
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
      const origin = dragOrigin.current;
      if (origin && Math.hypot(x - origin.x, y - origin.y) >= DRAG_THRESHOLD) {
        isDragging.current = true;
        movePoint(draggingId, { x, y });
      }
    }

    if (draggingVertexRef.current !== null && mode === 'edit') {
      isDragging.current = true;
      movePolygonVertex(draggingVertexRef.current.polyIdx, draggingVertexRef.current.vtxIdx, { x, y });
    }

    if (draggingWaypointRef.current !== null && mode === 'edit') {
      isDragging.current = true;
      const { fromId, toId, index } = draggingWaypointRef.current;
      moveWaypoint(fromId, toId, index, { x, y });
    }

    if (mode === 'polygon' && polygonPoints.length >= 3) {
      const first = polygonPoints[0];
      setIsNearFirst(Math.hypot(x - first.x, y - first.y) <= CLOSE_SNAP_RADIUS);
    } else {
      setIsNearFirst(false);
    }
  };

  const stopDrag = () => {
    if (draggingId !== null || draggingVertexRef.current !== null || draggingWaypointRef.current !== null) {
      store.saveHistory();
      setDraggingId(null);
      setDraggingVertex(null);
      draggingVertexRef.current = null;
      draggingWaypointRef.current = null;
      setTimeout(() => { isDragging.current = false; }, 0);
    }
  };

  // ---- Point handlers ----

  const handleSVGMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (mode !== 'edit') return;
    const { x, y } = getSVGCoords(e);
    const HIT = (settings.polygonVertexRadius + 8);
    // 1. Polygon vertices
    for (let pi = 0; pi < polygons.length; pi++) {
      const poly = polygons[pi];
      for (let vi = 0; vi < poly.points.length; vi++) {
        const pt = poly.points[vi];
        if (Math.hypot(x - pt.x, y - pt.y) <= HIT) {
          isDragging.current = false;
          dragOrigin.current = { x, y };
          draggingVertexRef.current = { polyIdx: pi, vtxIdx: vi };
          setDraggingVertex({ polyIdx: pi, vtxIdx: vi });
          return;
        }
      }
    }
    // 2. Edge waypoints — Shift+click removes, plain click starts drag
    const WP_HIT = 9;
    for (const conn of connections) {
      const wps = conn.waypoints ?? [];
      for (let wi = 0; wi < wps.length; wi++) {
        const w = wps[wi];
        if (Math.hypot(x - w.x, y - w.y) <= WP_HIT) {
          if (e.shiftKey) {
            removeWaypoint(conn.from_id, conn.to_id, wi);
            return;
          }
          isDragging.current = false;
          dragOrigin.current = { x, y };
          draggingWaypointRef.current = { fromId: conn.from_id, toId: conn.to_id, index: wi };
          return;
        }
      }
    }
  };

  const handlePointMouseDown = (e: React.MouseEvent, id: string) => {
    if (mode !== 'edit') return;
    e.stopPropagation();
    isDragging.current = false;
    dragOrigin.current = getSVGCoords(e);
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
      onNodeEdit?.(point);
      return;
    } else if (mode === 'delete') {
      removePoint(point.id);
    } else if (mode === 'connect') {
      if (selectedPoints.length === 0) {
        setSelectedPoints([point.id]);
      } else if (selectedPoints[0] === point.id) {
        setSelectedPoints([]);
      } else {
        // Toggle: second click on an already-connected pair removes the edge,
        // on an unconnected pair adds it. addConnection deduplicates internally.
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

  // Squared distance from point P to segment AB.
  const distSqToSegment = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + t * dx, py = a.y + t * dy;
    return (p.x - px) ** 2 + (p.y - py) ** 2;
  };

  const handleConnectionClick = (
    e: React.MouseEvent,
    from_id: string,
    to_id: string,
    allPts?: { x: number; y: number }[],
  ) => {
    e.stopPropagation();
    if (mode === 'delete') {
      removeConnection(from_id, to_id);
      return;
    }
    if (mode === 'edit' && allPts && allPts.length >= 2) {
      // Find which segment of the polyline was clicked; insert a waypoint at that position.
      const { x, y } = getSVGCoords(e);
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < allPts.length - 1; i++) {
        const d = distSqToSegment({ x, y }, allPts[i], allPts[i + 1]);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      addWaypoint(from_id, to_id, bestIdx, { x, y });
    }
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

  const pxToMeters = (from: { x: number; y: number }, to: { x: number; y: number }) =>
    (Math.hypot(to.x - from.x, to.y - from.y) / resolution).toFixed(2);

  return (
    <svg
      ref={svgRef}
      width={svgWidth}
      height={svgHeight}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      onClick={handleSVGClick}
      onMouseDown={handleSVGMouseDown}
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
        const deletable    = mode === 'delete';
        const editable     = mode === 'edit';
        const bindSelected = mode === 'bind' && bindingPolygonIndex === idx;
        const bindable     = mode === 'bind';
        const stroke = deletable ? CANVAS_COLORS.DELETE
          : bindSelected ? CANVAS_COLORS.BIND_ACTIVE
          : settings.polygonStrokeColor;
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
                fontSize={LABEL_FONT_SIZE.POLYGON} fontWeight="bold"
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
        const editable  = mode === 'edit';
        const wps = conn.waypoints ?? [];
        const allPts = [{ x: from.x, y: from.y }, ...wps, { x: to.x, y: to.y }];
        const polyStr = allPts.map(p => `${p.x},${p.y}`).join(' ');
        return (
          <g key={`conn-${conn.from_id}-${conn.to_id}`}>
            {/* Wide invisible hit area: catches clicks in delete (remove edge) and edit (add waypoint) */}
            {(deletable || editable) && (
              <polyline
                points={polyStr}
                fill="none"
                stroke="transparent"
                strokeWidth={Math.max(settings.lineWidth, 12)}
                strokeLinecap="round"
                strokeLinejoin="round"
                cursor={deletable ? 'pointer' : 'crosshair'}
                onClick={(e) => handleConnectionClick(e, conn.from_id, conn.to_id, allPts)}
              />
            )}
            <polyline
              points={polyStr}
              fill="none"
              stroke={deletable ? CANVAS_COLORS.DELETE : settings.lineColor}
              strokeWidth={settings.lineWidth}
              strokeLinejoin="round"
              pointerEvents="none"
            />
            {/* Waypoint handles in edit mode */}
            {editable && wps.map((w, wi) => {
              const isDragging = draggingWaypointRef.current?.fromId === conn.from_id
                              && draggingWaypointRef.current?.toId   === conn.to_id
                              && draggingWaypointRef.current?.index  === wi;
              return (
                <circle
                  key={`wp-${conn.from_id}-${conn.to_id}-${wi}`}
                  cx={w.x} cy={w.y} r={5}
                  fill="#fff"
                  stroke={settings.lineColor}
                  strokeWidth={1.5}
                  cursor={isDragging ? 'grabbing' : 'grab'}
                />
              );
            })}
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
              stroke={CANVAS_COLORS.MEASURE} strokeWidth="2" strokeDasharray="6 3" pointerEvents="none"
            />
            <circle cx={seg.from.x} cy={seg.from.y} r={4} fill={CANVAS_COLORS.MEASURE} pointerEvents="none" />
            <circle cx={seg.to.x}   cy={seg.to.y}   r={4} fill={CANVAS_COLORS.MEASURE} pointerEvents="none" />
            <text x={mx} y={my - 8} fontSize={LABEL_FONT_SIZE.MEASURE} fill={CANVAS_COLORS.MEASURE} textAnchor="middle" pointerEvents="none">
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
            stroke={CANVAS_COLORS.MEASURE} strokeWidth="2" strokeDasharray="6 3" pointerEvents="none"
          />
          <circle cx={measureStart.x} cy={measureStart.y} r={4} fill={CANVAS_COLORS.MEASURE} pointerEvents="none" />
          <text
            x={(measureStart.x + previewPoint.x) / 2}
            y={(measureStart.y + previewPoint.y) / 2 - 8}
            fontSize={LABEL_FONT_SIZE.MEASURE} fill={CANVAS_COLORS.MEASURE} textAnchor="middle" pointerEvents="none"
          >
            {pxToMeters(measureStart, previewPoint)} м
          </text>
        </g>
      )}

      {/* Binding lines: polygon centroid → entry nav-nodes */}
      {polygons.map((poly, idx) => {
        if (!poly.nav_node_client_ids?.length) return null;
        if (poly.points.length === 0) return null;
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
                  stroke={isSelected ? CANVAS_COLORS.BIND_ACTIVE : CANVAS_COLORS.BIND_INACTIVE}
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
        const isSelected     = mode === 'connect' && selectedPoints.includes(point.id);
        const isDraggingThis = draggingId === point.id;
        const fill           = isSelected ? CANVAS_COLORS.SELECT : (NODE_TYPE_COLOR[point.node_type] || settings.pointColor);
        const stroke         = isSelected ? '#fff' : settings.pointStrokeColor;
        const nodeCursor     = mode === 'edit' ? (isDraggingThis ? 'grabbing' : 'grab') : 'pointer';
        const r              = settings.pointRadius;

        const isBound = mode === 'bind' && bindingPolygonIndex !== null &&
          (polygons[bindingPolygonIndex]?.nav_node_client_ids ?? []).includes(point.id);
        const isBindableRoom = mode === 'bind' && bindingPolygonIndex !== null &&
          point.node_type !== 'corridor' && point.node_type !== 'passage' && !isBound;

        return (
          <g key={`point-${point.id}`}>
            {/* Selection ring (connect mode) */}
            {isSelected && (
              <circle cx={point.x} cy={point.y} r={r + NODE_RING_OFFSET.SELECT}
                fill="none" stroke={CANVAS_COLORS.SELECT} strokeWidth="2" pointerEvents="none" />
            )}
            {/* Bound entry-node ring (bind mode) */}
            {isBound && (
              <circle cx={point.x} cy={point.y} r={r + NODE_RING_OFFSET.BOUND}
                fill="none" stroke={CANVAS_COLORS.BIND_ACTIVE} strokeWidth="2.5" pointerEvents="none" />
            )}
            {/* Bindable-but-not-yet-bound hint ring */}
            {isBindableRoom && (
              <circle cx={point.x} cy={point.y} r={r + NODE_RING_OFFSET.HINT}
                fill="none" stroke={CANVAS_COLORS.BIND_HINT} strokeWidth="1.5" strokeDasharray="3 2" pointerEvents="none" />
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
                fontSize={LABEL_FONT_SIZE.NODE} fill={fill} pointerEvents="none"
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
            const isFirst    = idx === 0 && polygonPoints.length >= 3;
            const snapActive = isFirst && isNearFirst;
            return (
              <g key={`preview-vertex-${idx}`}>
                {isFirst && (
                  <circle
                    cx={pt.x} cy={pt.y}
                    r={settings.polygonVertexRadius + (snapActive ? 7 : 4)}
                    fill="none" stroke={CANVAS_COLORS.MEASURE} strokeWidth="2"
                    opacity={snapActive ? 1 : 0.5} pointerEvents="none"
                  />
                )}
                <circle
                  cx={pt.x} cy={pt.y}
                  r={settings.polygonVertexRadius}
                  fill={isFirst ? CANVAS_COLORS.MEASURE : settings.polygonVertexColor}
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
          r={4} fill={CANVAS_COLORS.MEASURE} opacity="0.6" pointerEvents="none"
        />
      )}

      {/* Route preview overlay */}
      {routeOverlay && routeOverlay.polyline.length >= 2 && (
        <g pointerEvents="none">
          <polyline
            points={routeOverlay.polyline.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={CANVAS_COLORS.ROUTE}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.8}
          />
          {routeOverlay.stepMarkers.map((marker, i) => (
            <g key={`step-${i}`}>
              <circle cx={marker.x} cy={marker.y} r={5}
                fill="#fff" stroke={CANVAS_COLORS.ROUTE} strokeWidth={2} />
              <circle cx={marker.x} cy={marker.y} r={7}
                fill="none" stroke={CANVAS_COLORS.ROUTE} strokeWidth={1} opacity={0.4} />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
};
