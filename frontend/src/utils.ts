import { NodeType, Point } from './types';

const LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З'];

/**
 * Suggests a default name for a newly placed nav-node based on its type and context.
 * The result is shown as defaultValue in the name prompt so the user can correct it.
 *
 * Important for stairs/elevators: the letter suffix (А, Б, …) must match across floors
 * so the routing algorithm can connect them by name.
 */
export function suggestNodeName(
  node_type: NodeType,
  existingNodes: Point[],
  floorName: string,
  linkedObjectName?: string,
): string {
  const floorNum = floorName.match(/\d+/)?.[0] ?? floorName;
  const sameType = existingNodes.filter(n => n.node_type === node_type);

  switch (node_type) {
    case 'room':
      // Name comes from the linked object; empty until polygon is bound
      return linkedObjectName ?? '';
    case 'corridor':
      if (sameType.length === 0) return `К${floorNum}`;
      return `К${floorNum}-${LETTERS[sameType.length - 1] ?? sameType.length}`;
    case 'stairs':
      return `Лест-${LETTERS[sameType.length] ?? sameType.length + 1}`;
    case 'elevator':
      return `Лифт-${sameType.length + 1}`;
    case 'door':
      return `Д-${LETTERS[sameType.length] ?? sameType.length + 1}`;
    case 'exit':
      return `Выход-${LETTERS[sameType.length] ?? sameType.length + 1}`;
  }
}
