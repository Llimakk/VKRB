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
      return `К-${sameType.length + 1}`;
    case 'stairs':
      return `Лест-${LETTERS[sameType.length] ?? sameType.length + 1}`;
    case 'elevator':
      return `Лифт-${sameType.length + 1}`;
    case 'toilet':
      return `Туалет-${sameType.length + 1}`;
    case 'passage':
      return linkedObjectName ?? `Проход-${sameType.length + 1}`;
    case 'exit':
      return `Выход-${LETTERS[sameType.length] ?? sameType.length + 1}`;
  }
}
