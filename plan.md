# ESPECIFICACIÓN TÉCNICA REVISADA: ELECTROPLAN-WEB

---

## 1. OBJETIVO DEL SISTEMA

Desarrollar una aplicación web interactiva para que usuarios no expertos diseñen y documenten planos eléctricos residenciales simples por módulos independientes (habitaciones), permitiendo su posterior fusión en un plano maestro y garantizando una salida impresa vectorial de alta calidad con rendimiento fluido (60 FPS).

---

## 2. FLUJO DE TRABAJO Y MODULARIDAD (CONEXIÓN POR PARTES)

### 2.1. Estructura de Capas por Módulo

* **Vista Física (Plano de Planta):** Espacio bidimensional con cuadrícula acotada donde el usuario arrastra y ubica componentes fijos (Cajetines $Jb$, Tomacorrientes $Tc$, Interruptores $Sw$, Lámparas $b$).
* **Vista Lógica (Esquema de Conexiones):** Interfaz simplificada que se activa al seleccionar un cajetín de paso, permitiendo trazar líneas de interconexión punto a punto entre bornes.

### 2.2. Sistema de Fusión (Merge & Snap)

* **Independencia de Archivos:** Cada estancia (Cocina, Sala, Baño) se guarda como un objeto JSON modular con sus propias coordenadas locales.
* **Lienzo Maestro:** Interfaz global donde se importan los módulos como bloques. El sistema dispone de puntos de anclaje magnéticos (Snap Anchors) en los extremos para unificar las tuberías troncales automáticamente al aproximar los módulos.

---

## 3. SUBSISTEMA VARIABLE DE CONDUCTORES (CABLES DINÁMICOS)

Debido a la variabilidad de normativas, regiones y tramos de la instalación, **los atributos de los cables no son estáticos**. El sistema implementa un motor de perfiles configurables.

### 3.1. Administrador de Perfiles de Cable (Dinamismo de Atributos)

El sistema estructurará las conexiones basándose en un diccionario de variables inyectables. El usuario o el sistema (según plantilla regional) asignará los valores:

| Variable de Entrada | Tipo de Datos | Propiedad Modificable en UI | Impacto en el Sistema |
| --- | --- | --- | --- |
| **Identificador ID** | Alfanumérico | No modificable (`Fase_Gen`, `Neutro_Ilum`) | Llave de relación en la base de datos JSON. |
| **Color del Trazo** | Hexadecimal / RGB | Selector de paleta de colores visual | Renderizado de la línea en Canvas y PDF. |
| **Grosor del Trazo** | Numérico (Píxeles) | Desplegable de grosor visual | Representa visualmente la jerarquía/potencia. |
| **Etiqueta Técnica** | Cadena de texto | Campo de texto libre (Ej: #12 AWG, 4mm²) | Texto literal impreso junto al cable. |
| **Función de Línea** | Enumerado | Selección (Fase, Neutro, Retorno, Tierra) | Lógica de validación para el motor de cortocircuitos. |

### 3.2. Automatización de Etiquetas en Tramos ($w_x$)

* Cuando un conjunto de conductores variables viaja por una misma canalización, el motor gráfico agrupa las líneas y genera automáticamente una nomenclatura indexada secuencial ($w_1, w_2, w_3...$).
* El sistema mantendrá la visualización física del color seleccionado y renderizará el texto de la **Etiqueta Técnica** activa de forma adyacente a cada línea en el plano definitivo.

---

## 4. ARQUITECTURA DE SOFTWARE Y OPTIMIZACIÓN

### 4.1. Separación de Conceptos

* **Estado (Store JSON):** Almacena únicamente nodos, coordenadas $(x, y)$ y el ID del perfil de cable asociado. No almacena estilos visuales en el flujo de datos lógico.
* **Motor Gráfico (Render):** Lee el JSON y el diccionario de perfiles activos para dibujar las formas vectoriales en pantalla.

### 4.2. Controles de Fluidez

* **Doble Canvas Operacional:** Un lienzo inferior estático procesa el fondo y las paredes (solo se redibuja en eventos de Zoom). Un lienzo superior dinámico procesa el arrastre de cables e iconos a tiempo real.
* **Búsquedas de Rendimiento Constante:** Uso de estructuras de datos `Map()` de JavaScript para indexar los componentes y cables por ID, asegurando accesos directos de orden $O(1)$ sin ciclos de búsqueda lentos.

---

## 5. REQUISITOS DE SALIDA (IMPRESIÓN)

* **Salida Vectorial:** Procesamiento nativo mediante formato SVG o Canvas escalado de alta densidad para evitar pixelación en impresoras físicas.
* **Ocultamiento de Interfaz:** Uso de consultas de medios (`@media print`) en CSS para suprimir barras de herramientas, botones de edición y menús web al activar el cuadro de diálogo de impresión.
* **Bloque de Leyenda Dinámico:** Espacio automatizado en el formato de impresión que lee los perfiles de cable utilizados exclusivamente en ese plano y genera la tabla de correspondencia de colores, textos técnicos y cálculo estimado de longitudes (Metraje).