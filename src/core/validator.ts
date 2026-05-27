import { Node, WireFunction } from './types.ts';

export interface ValidationError {
  readonly id: string;
  readonly message: string;
  readonly type: 'short_circuit' | 'orphan_node' | 'unknown_profile' | 'unconnected_node';
}

interface FlatConnection {
  readonly id?: string;
  readonly from: string;
  readonly to: string;
  readonly profileId: string;
}

export function validateWithProfiles(
  nodes: Map<string, Node>,
  connections: readonly FlatConnection[],
  profileFunctionResolver: (profileId: string) => WireFunction | undefined
): readonly ValidationError[] {
  const errors: ValidationError[] = [];
  const nodeIds = new Set(nodes.keys());
  const connectedNodeIds = new Set<string>();

  for (const conn of connections) {
    const errId = conn.id || 'unknown';
    if (!nodeIds.has(conn.from)) {
      errors.push({ id: errId, message: `Missing from node ${conn.from}`, type: 'orphan_node' });
    }
    if (!nodeIds.has(conn.to)) {
      errors.push({ id: errId, message: `Missing to node ${conn.to}`, type: 'orphan_node' });
    }

    const fn = profileFunctionResolver(conn.profileId);
    if (fn === undefined) {
      errors.push({ id: errId, message: `Unknown profile ${conn.profileId}`, type: 'unknown_profile' });
    }

    if (nodeIds.has(conn.from) && nodeIds.has(conn.to)) {
      connectedNodeIds.add(conn.from);
      connectedNodeIds.add(conn.to);
    }
  }

  for (const [id, node] of nodes.entries()) {
    if (!connectedNodeIds.has(id) && node.type !== 'junction_box') {
      errors.push({ id, message: `Unconnected node ${id}`, type: 'unconnected_node' });
    }
  }

  const adjacency = new Map<string, { nodeId: string; function: WireFunction }[]>();
  for (const conn of connections) {
    const fn = profileFunctionResolver(conn.profileId);
    if (!fn) continue;
    if (!nodeIds.has(conn.from) || !nodeIds.has(conn.to)) continue;

    if (!adjacency.has(conn.from)) adjacency.set(conn.from, []);
    if (!adjacency.has(conn.to)) adjacency.set(conn.to, []);
    adjacency.get(conn.from)!.push({ nodeId: conn.to, function: fn });
    adjacency.get(conn.to)!.push({ nodeId: conn.from, function: fn });
  }

  const visitedPairs = new Set<string>();
  for (const [nodeId, neighbors] of adjacency.entries()) {
    for (let i = 0; i < neighbors.length; i++) {
      for (let j = i + 1; j < neighbors.length; j++) {
        const a = neighbors[i];
        const b = neighbors[j];
        const pairKey = [a.nodeId, b.nodeId].sort().join('-');
        if (visitedPairs.has(pairKey)) continue;
        visitedPairs.add(pairKey);

        const riskyPairs: [WireFunction, WireFunction][] = [
          ['fase', 'neutro'],
          ['fase', 'tierra'],
          ['fase', 'retorno'],
        ];
        for (const [f1, f2] of riskyPairs) {
          if (
            (a.function === f1 && b.function === f2) ||
            (a.function === f2 && b.function === f1)
          ) {
            errors.push({
              id: `${nodeId}-${pairKey}`,
              message: `Short circuit risk at node ${nodeId}: ${a.function} + ${b.function}`,
              type: 'short_circuit',
            });
          }
        }
      }
    }
  }

  return errors;
}
