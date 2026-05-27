# agents.md — Guía del agente para OpenCode

## Propósito
Este documento es la referencia canónica para el agente IA que trabaja en el proyecto `electric`.
Debe mantener el desarrollo alineado con el plan técnico, el stack elegido y las buenas prácticas de código abierto, evitando desviaciones innecesarias.

## Objetivo del proyecto
- Construir una aplicación web para diseñar planos eléctricos residenciales simples.
- Soportar módulos independientes por estancia con capacidad de fusión en un plano maestro.
- Generar salida vectorial de alta calidad y mantener rendimiento fluido (60 FPS).

---

## Stack Tecnológico

| Capa | Tecnología | Versión | Justificación |
|------|-----------|---------|---------------|
| Lenguaje | TypeScript | 5.x | Tipado fuerte para modelos JSON complejos. Auto-documenta interfaces. |
| Build / Dev | Vite | 5.x | HMR instantáneo, ESM nativo, cero configuración, bundling optimizado. |
| Testing | Vitest | 1.x | Integración nativa con Vite, rápido, API compatible con Jest. |
| Linting | ESLint + Prettier | — | Soporte TypeScript, mantenible por agentes IA. |
| Renderizado | Canvas 2D API | Nativo | Especificado por el plan. Doble lienzo: estático + dinámico. |
| Exportación | SVG nativo / canvas.toDataURL | Nativo | Salida vectorial sin dependencias externas. |
| Estado | Clases TS puras + `Map<ID, T>` | Nativo | Acceso O(1), JSON-serializable, separado del render. |
| UI DOM | TypeScript + CSS directo | Nativo | Paneles simples. No justifica framework. Sin virtual DOM. |

### Dependencias externas
- **Producción:** ninguna. Solo APIs del navegador.
- **Desarrollo:** `vite`, `vitest`, `typescript`, `eslint`, `prettier`, `@typescript-eslint/*`.

### Tecnologías explícitamente descartadas
React, Vue, Svelte, Angular, Lit, jQuery, Three.js, PixiJS, Bootstrap, Tailwind.
**Razón:** El núcleo de la app es renderizado Canvas imperativo. Un framework DOM añade abstracción, peso y complejidad sin resolver el problema central.

---

## Arquitectura de Directorios

```
electric/
├── src/
│   ├── core/                # Estado, validación, tipos canónicos
│   │   ├── types.ts             # Interfaces: Node, CableProfile, Module, SnapAnchor
│   │   ├── store.ts             # Estado central (Map<ID, T>), serialización JSON
│   │   ├── validator.ts         # Motor de cortocircuitos pasivo
│   │   └── profiles.ts          # Diccionario de perfiles de cable configurables
│   ├── renderer/            # Motor gráfico (Canvas 2D)
│   │   ├── background.ts        # Lienzo inferior: paredes, grid, elementos estáticos
│   │   ├── foreground.ts        # Lienzo superior: arrastre, cables, interacción
│   │   ├── symbols.ts           # Dibujo de símbolos eléctricos (Jb, Sw, Tc, b)
│   │   └── labels.ts            # Etiquetas automáticas w₁, w₂, w₃...
│   ├── modules/             # Gestión de módulos por estancia
│   │   ├── module-manager.ts    # CRUD de módulos, import/export JSON
│   │   └── snap-engine.ts       # Motor de fusión por Snap Anchors
│   ├── ui/                  # Paneles DOM (TypeScript vanilla, sin framework)
│   │   ├── toolbar.ts           # Barra de herramientas
│   │   ├── inspector.ts         # Panel de propiedades
│   │   ├── module-list.ts       # Lista de módulos/estancias
│   │   └── legend.ts            # Leyenda dinámica para impresión
│   ├── export/              # Salida vectorial e impresión
│   │   ├── svg-export.ts        # Generación SVG
│   │   └── print.css            # @media print
│   ├── events.ts            # Bus de eventos para comunicación entre subsistemas
│   └── main.ts              # Punto de entrada, inicialización
├── tests/                   # Pruebas unitarias (Vitest)
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Flujo de Datos (Unidireccional)

```
[JSON State / Store] ──lee──▶ [Renderer Canvas (background + foreground)]
       ▲                              │
       │                              ▼
  [Event Bus] ◀─────── [UI DOM / Input Events / Interacción ratón]
       │
       ▼
  [Validator] ──▶ [Errores / Warnings reportados a UI]
```

### Reglas del flujo
- El **Store** nunca contiene estilos visuales. Solo nodos, coordenadas, IDs, perfiles.
- El **Renderer** solo lee el Store. Nunca escribe en él.
- La **UI** emite eventos de alto nivel (`module:added`, `cable:connected`, `snap:detected`).
- El **Store** procesa eventos, muta estado y notifica al Renderer.
- El **Validator** corre en segundo plano y reporta vía Event Bus.

---

## Principios OpenCode

1. Código claro y legible
   - Nombres descriptivos y consistentes en inglés para código, español para docs.
   - Comentarios solo cuando agregan valor. El tipado de TypeScript debe ser la primera fuente de documentación.
   - Evitar jerga innecesaria.
2. Modularidad y separación de responsabilidades
   - Cada archivo en `src/` tiene una responsabilidad única y clara.
   - Estado separado del render.
   - Datos serializables en JSON para módulos y perfiles de cable.
3. Rendimiento y simplicidad
   - Uso de `Map()` para accesos O(1).
   - Dos lienzos Canvas: fondo estático (redibujado solo en zoom) y capa dinámica.
   - Minimizar redibujos. Usar `requestAnimationFrame` para el loop dinámico.
   - Sin dependencias de producción. Solo TypeScript compilado a JS.
4. Compatibilidad y portabilidad
   - Solo APIs estándares del navegador (Canvas, SVG, CSS, DOM).
   - Sin dependencias propietarias ni pesadas.
   - Código fácilmente auditable por agentes IA.
5. Documentación práctica
   - Especificaciones cortas y precisas.
   - Tablas y listas para estructuras de datos y atributos.
   - Incluir ejemplos concretos cuando sea necesario.
   - **VITALS.md** como registro vivo del estado del proyecto (ver abajo).

---

## Reglas de diseño del agente

- **Seguir el plan técnico y este agents.md.** Si una solución no está contemplada, elegir la opción más cercana a la arquitectura propuesta.
- **No inventar requisitos nuevos.** Si no está en el plan o en un requerimiento explícito, pedir clarificación.
- **Priorizar la modularidad.** Cada estancia es un módulo JSON con coordenadas locales y perfil de cable asociable.
- **Render independiente del estado.** El motor gráfico debe leer JSON + diccionario de perfiles activos.
- **Mecanismo de Fusión por Anclaje.** La unión de módulos en el plano maestro debe basarse en Snap Anchors en los extremos de las tuberías troncales ($Tw$). Al aproximar dos módulos, las líneas compatibles deben auto-conectarse.
- **Salida vectorial.** Siempre que sea posible, la exportación debe ser SVG o Canvas escalado.
- **Impresión limpia.** Usar `@media print` para ocultar UI no relevante.

### Regla obligatoria: actualizar VITALS.md
**Después de cada sesión de trabajo que produzca cambios en el código, estructura del proyecto, decisiones de arquitectura, adición de features, o resolución de bugs**, el agente debe actualizar el archivo `VITALS.md` registrando:
- Qué se modificó/añadió.
- Decisiones tomadas y su justificación.
- Estado actual de cada subsistema (core, renderer, modules, ui, export).
- Próximos pasos pendientes (planificado vs implementado).
- Cualquier aspecto importante que un agente futuro deba conocer para continuar el trabajo.

---

## Estándares de implementación

### TypeScript
- `strict: true` en tsconfig.json.
- Interfaces para todos los modelos de datos. No usar `any`.
- Tipos exportados desde `src/core/types.ts` como fuente única de verdad.
- Usar `readonly` en propiedades que no deben mutarse fuera del Store.
- Preferir tipos literales para enumerados (ej: `type WireFunction = 'fase' | 'neutro' | 'retorno' | 'tierra'`).

### Modelo de datos
- Estado central: nodos, componentes, coordenadas, IDs y perfil de cable.
- No almacenar estilos visuales dentro del estado lógico.
- Perfiles de cable son diccionarios configurables con atributos variables.
- Validación Eléctrica Pasiva: el motor de lógica debe usar el atributo `function` de los cables para verificar en segundo plano que no existan cortocircuitos teóricos (ej: unión directa de Fase con Neutro) antes de habilitar la exportación.

### Estructura de datos recomendada (Map)
```typescript
// src/core/types.ts
type ComponentType = 'junction_box' | 'outlet' | 'switch' | 'lamp';
type WireFunction = 'fase' | 'neutro' | 'retorno' | 'tierra';

interface Point { x: number; y: number; }

interface CableProfile {
  id: string;
  color: string;        // hex, ej: '#FF0000'
  width: number;        // px
  label: string;        // ej: '#12 AWG'
  function: WireFunction;
}

interface Node {
  id: string;
  type: ComponentType;
  position: Point;
  profileId: string;    // FK a CableProfile
}

interface Connection {
  id: string;
  from: string;         // Node.id
  to: string;           // Node.id
  profileId: string;
}

interface Module {
  id: string;
  name: string;
  nodes: Map<string, Node>;
  connections: Map<string, Connection>;
  snapAnchors: SnapAnchor[];
}

interface SnapAnchor {
  id: string;
  position: Point;      // coordenada local al módulo
  direction: 'input' | 'output';
  compatibleFunctions: WireFunction[];
}
```

### Perfiles de cable
Cada perfil debe incluir al menos:
- `id` (alfanumérico)
- `color` (hex o RGB)
- `width` (grosor en px)
- `label` (texto técnico)
- `function` (fase, neutro, retorno, tierra)

### UI y render
- Lienzo inferior (Canvas background): fondo, paredes, cuadrícula, elementos estáticos. Solo redibujar en zoom o cambio de módulo.
- Lienzo superior (Canvas foreground): arrastre, cables dinámicos, interacciones en tiempo real. Redibujar en cada `requestAnimationFrame` durante interacción.
- Etiquetas automáticas en tramos agrupados con nomenclatura secuencial ($w_1, w_2, w_3...$).
- Bloque de Leyenda Dinámico Obligatorio: el sistema debe generar automáticamente en la salida de impresión un cuadro que mapee exclusivamente los perfiles de cable utilizados en ese diseño, mostrando su color, grosor, texto técnico y el cálculo estimado de metraje (longitud).

### Convenciones de código
- Nombres de archivos: `kebab-case.ts`.
- Nombres de clases/interfaces: `PascalCase`.
- Nombres de funciones/variables: `camelCase`.
- Nombres de constantes/Mapas globales: `UPPER_SNAKE_CASE`.
- Un `export` por cada tipo/clase/función principal. Usar barrels (`index.ts`) en carpetas con múltiples exports.
- Eventos: nombres en formato `subsystem:action` (ej: `module:added`, `renderer:redraw`, `validator:error`).

---

## Criterios de estilo para el agente
- Usar español técnico claro, evitando explicaciones excesivas.
- Evitar respuestas genéricas; entregar soluciones específicas al proyecto.
- Si el cambio es de implementación, incluir archivos y fragmentos de código pertinentes.
- Si hay duda sobre una decisión de diseño, solicitar información adicional en lugar de improvisar.

---

## Qué no hacer
- No agregar características completas que no estén en el plan.
- No usar soluciones propietarias o dependencias innecesarias.
- No instalar frameworks de UI (React, Vue, Svelte, etc.).
- No romper la estructura de módulos JSON.
- No mezclar datos de estado con estilos de render.
- No escribir `any` en TypeScript.
- No omitir la actualización de `VITALS.md` tras cambios.

---

## Ejemplo de uso esperado
- Responder a peticiones de implementación con una propuesta concreta de archivo y contenido.
- Mantener ficheros pequeños y coherentes con el objetivo del plano eléctrico.
- Optimizar para claridad y mantenibilidad, compatible con un equipo abierto y agentes IA.

---

## Notas finales
Este archivo es la guía de referencia canónica para cualquier tarea relacionada con la aplicación `electric`.
Al generar código o documentación, estructurar las decisiones en el formato: **objetivo, restricción, solución.**
El archivo `VITALS.md` es el complemento vivo que registra la evolución del proyecto. Ambos archivos deben consultarse al inicio de cada sesión de trabajo.
