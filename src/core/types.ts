export type ComponentType = 'junction_box' | 'outlet' | 'switch' | 'lamp' | 'panel';

export type WireFunction = 'fase' | 'neutro' | 'retorno' | 'tierra';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface CableProfile {
  readonly id: string;
  readonly color: string;
  readonly width: number;
  readonly label: string;
  readonly function: WireFunction;
}

export interface Node {
  readonly id: string;
  readonly type: ComponentType;
  readonly position: Point;
  readonly label: string;
}

export interface Conductor {
  readonly id: string;
  readonly wireLabel: string;
  readonly profileId: string;
}

export interface Connection {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly via: readonly string[];
  readonly conductorIds: readonly string[];
}

export interface SnapAnchor {
  readonly id: string;
  readonly position: Point;
  readonly direction: 'input' | 'output';
  readonly compatibleFunctions: readonly WireFunction[];
}

export interface ModuleLink {
  readonly id: string;
  readonly fromModuleId: string;
  readonly toModuleId: string;
  readonly conductorIds: readonly string[];
}

export interface Module {
  readonly id: string;
  readonly name: string;
  readonly position: Point;
  readonly size: Size;
  readonly nodes: Map<string, Node>;
  readonly connections: Map<string, Connection>;
  readonly conductors: Map<string, Conductor>;
  readonly snapAnchors: readonly SnapAnchor[];
}
