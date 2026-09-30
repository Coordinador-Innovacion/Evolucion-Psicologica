# 08 — UI SPEC · PROMPT MAESTRO DE FRONTEND

> Documento para pegar completo al agente de programación (MiMo). **Complementa** —no reemplaza— los 8 documentos oficiales ni `00_DECISIONES_CONFIRMADAS.md`. Si algo de aquí contradice una decisión `VIGENTE`, gana la decisión.

---

## 0. MISIÓN

El backend (migraciones 001–052, RLS, funciones) está implementado. **El frontend quedó mínimo: casi una pantalla CRUD por tabla.** Fallas reales confirmadas por el dueño del proyecto:

1. `Registrar estudiante` solo inserta en `estudiantes`. No registra período escolar, familiares ni ninguna otra tabla relacionada.
2. **No se puede crear un Caso** desde la interfaz.
3. `Registrar I.E.` guarda la institución pero **no permite registrar su licencia**.

Tu misión: construir **toda** la interfaz web (Next.js + TypeScript) que exponga la lógica ya definida, para **todos los roles**, con un diseño futurista, elegante y moderno (ver §3). Cada pantalla de §5 tiene un **ID**. **No puedes declarar el trabajo terminado mientras exista un ID sin implementar y sin prueba e2e** (ver §8 y §9).

Los reportes anteriores marcaron flujos como "verificados end-to-end" sin que nadie los probara en un navegador. Esta vez "verificado" significa **probado con Playwright contra Supabase local/staging, verificando filas reales en las tablas**.

---

## 1. REGLAS NO NEGOCIABLES

1. **Fuente de verdad:** los 8 documentos + decisiones `VIGENTE`. Lo `SUPERSEDIDO` no gobierna nada (flujo de transferencia 019, `diagnosticos_anuales`, cierre de sesión por licencia, etc.).
2. **La UI nunca es autoridad de seguridad.** Toda regla crítica se valida en servidor. La UI anticipa (deshabilita, avisa) **y además** maneja con elegancia el rechazo del servidor. Jamás `service_role` en el navegador.
3. **Un solo rol activo por persona:** Global, Director, Administrador I.E., Coordinador, Docente, Psicólogo. **No crear roles.** El estudiante **no tiene cuenta**: es respondiente por enlace + DNI.
4. **Sin contraseñas propias:** Supabase Auth. Registro público crea **solo `docente`**. `claim_first_global()` **no se invoca desde la app** (el primer Global se crea desde el Dashboard de Supabase).
5. **Licencia vencida (DC-003/004/005/009):** NO cambia roles, NO cierra sesión, NO bloquea el acceso. Solo impide **crear nuevas atenciones psicológicas** (validado en servidor). La edición de atenciones existentes dentro de su ventana sigue permitida. Global tiene bypass total.
6. **Historia inmutable:** ningún botón "Eliminar" para atenciones, casos, derivaciones, períodos ni documentos clínicos. Atención editable **30 min** desde su registro, medido con **hora del servidor**.
7. **Encuestas:** versión usada = inmutable · copiar ≠ versionar · nueva aplicación ≠ nueva versión · ampliar plazo ≠ nueva aplicación · componentes visuales son **código frontend** (nunca HTML/React en la BD).
8. **Fuera de alcance V0:** agenda, calendario de sesiones, reservas, "próximas atenciones", pagos, campañas de encuestas, editor HTML libre, ficha diagnóstica de 11 bloques, derivación web asistida, notificaciones por correo/WhatsApp/SMS. **La imagen de referencia muestra algunos de estos elementos; NO los implementes** (ver §11).
9. **Contenido clínico nunca aparece en:** búsqueda global, notificaciones, toasts, títulos de pestaña, parámetros de URL, logs ni analítica.
10. **Operaciones multi-tabla = una RPC transaccional** con autorización, auditoría y test. Si falta, créala en una **nueva** migración (no edites las anteriores) y repórtalo.
11. **Si falta una decisión de negocio, detente y pregunta** (lista inicial en §10). No inventes reglas.
12. **Reutiliza el stack existente** (Tailwind, componentes, cliente Supabase). Agrega dependencias solo si son necesarias y repórtalas.
13. TypeScript estricto, validación con Zod, sin `any`, sin datos mock en pantallas finales.
14. **Idioma es-PE.** Fechas `dd/MM/yyyy HH:mm`, zona `America/Lima`. Los cálculos de tiempo (ventana de 30 min, ventana de encuesta, licencia) usan **hora del servidor**, nunca el reloj del cliente.

---

## 2. FASE 0 — AUDITORÍA (sin cambiar código)

Entrega `docs/UI_GAP_AUDIT.md` y `docs/UI_COVERAGE.md` y **espera aprobación** antes de programar.

a. **Inventario** de rutas y componentes actuales (las 18 páginas del build).
b. **Matriz tabla → pantalla:** para cada entidad del PLAN (estudiantes, familiares, periodos_escolares, niveles_educativos, grados, asignaciones_docentes, encuestas*, necesidades_especiales, derivaciones, casos, caso_responsables_historial, atenciones, transferencias, licencias, licencia_codigos, perfiles, auditoria, lotes_promocion, acciones_promocion, excepciones_promocion, documentos) indica si existe UI de crear / ver / editar. Lo mismo para cada RPC/función (`initiate_transfer`, `authorize_transfer`, `reject_transfer`, `prepare_promotion`, `execute_promotion`, `map_grade`, `copy_survey`, `lookup_institution_by_code`, `create_attention`, `delete_institution`, `get_student_periods`, etc.).
c. **Permisos reales:** extrae de las políticas RLS y funciones con autorización el mapa real por rol y genera `src/lib/permissions.ts` (fuente única para menú, rutas, botones). Compáralo con la matriz de §4 y **reporta diferencias**; ante duda, manda la RLS.
d. **Esquemas reales** que cambian la UI: `encuesta_aplicaciones` / `encuesta_respuestas` (¿respondiente único o enlace común?), `atenciones`, `instituciones`, `familiares`, `derivaciones`, `casos`, `necesidades_especiales`. Documenta las columnas.
e. **RPC faltantes** para que cada pantalla guarde en una sola transacción.
f. `UI_COVERAGE.md`: tabla `ID | ruta | roles | estado (❌/🟡/✅) | archivo | test e2e`, con **todos** los IDs de §5 en ❌.

---

## 3. SISTEMA DE DISEÑO

**Referencia visual:** `imagen de referencia de frondend.png` (producto "Bienestar Escolar"). Replica su lenguaje —sidebar oscuro con degradado, tarjetas pastel, pills de estado, listas con barra de color, donut, timeline, panel de detalle a la derecha— y llévalo a algo más **futurista**. El nombre del producto va en una constante `APP_NAME` (placeholder "Bienestar Escolar").

### 3.1 Tokens (variables CSS + Tailwind theme)

| Token | Claro | Oscuro |
|---|---|---|
| `--bg` | `#F4F6FE` | `#0A1024` |
| `--surface` | `#FFFFFF` | `#111A36` |
| `--surface-glass` | `rgba(255,255,255,.72)` + `backdrop-blur-xl` | `rgba(17,26,54,.6)` + blur |
| `--border` | `#E6E9F5` | `#22305A` |
| `--ink-900/700/500/300` | `#0F1733 / #2B3457 / #5B6488 / #A7AEC9` | `#F2F4FF / #C9D0EE / #8E98C4 / #566089` |
| `--brand-500` (primario) | `#6C63F0` | `#8B84FF` |
| `--brand-600 / --brand-100` | `#5548E0 / #ECEBFF` | `#6C63F0 / #1E2150` |
| Acentos | teal `#14B8A6`, cian `#22D3EE`, azul `#3B82F6`, ámbar `#F59E0B`, rosa `#F43F5E`, verde `#22C55E`, violeta `#A855F7` | igual, con glow |

- **Sidebar:** degradado vertical navy `#0E1A3A → #1B1F5E → violeta #5B4BDB` con **ola SVG** abajo y frase motivacional ("Cada proceso cuenta. Tu trabajo hace la diferencia."). Ítem activo = píldora `--brand-500` con texto blanco. Colapsable a riel de iconos (72 px). Ancho 240 px.
- **Topbar (64 px, glass):** buscador global (izq.), campana con badge, chip de fecha, avatar + nombre + rol (menú).
- **Tarjetas:** `rounded-2xl`, sombra `0 1px 2px rgba(15,23,51,.04), 0 12px 32px rgba(76,81,191,.08)`. Hover: leve elevación y borde con degradado.
- **KPI cards:** fondo pastel (violeta/teal/ámbar/rosa) + icono en cuadrado redondeado de color + número grande con animación *count-up*.
- **Toque futurista (con mesura):** bordes con degradado sutil en tarjetas hero, glow en botón primario, `backdrop-blur` en topbar/modales, transiciones de página (framer-motion, ≤200 ms), skeletons con shimmer, paleta de comandos `Ctrl/⌘+K`. Nada de neón excesivo ni animaciones que estorben.
- **Tipografía:** *Plus Jakarta Sans* (títulos) + *Inter* (cuerpo) vía `next/font`. Escala: 12/13/14/16/20/24/32.
- **Iconos:** `lucide-react`, trazo 1.75. **Avatares: iniciales sobre degradado** (el spec no tiene foto de estudiante; no pedir foto).
- **Modo claro por defecto (como la referencia) + modo oscuro** con toggle en Configuración; respeta `prefers-color-scheme`.

### 3.2 Patrón de estados de Caso (solo estos 3, no inventar más)

| Estado | Pill | Barra izquierda de fila |
|---|---|---|
| Inicio | verde suave | verde |
| En proceso | cian/azul | cian |
| Cerrado | gris azulado | gris |

La referencia muestra "En seguimiento", "En tratamiento" y "Sin responsable": **mapéalos a los 3 estados reales**. "Sin responsable" solo puede existir como **badge secundario** si el dato lo permite (responsable actual nulo).

### 3.3 Layout

- **Escritorio ≥1280 px:** patrón *lista + panel de detalle sticky a la derecha* (como la referencia) en Casos, Estudiantes, Derivaciones y Transferencias. En <1280 px el detalle es página completa o drawer.
- **Móvil:** sidebar → barra inferior de 5 ítems + drawer; tablas → tarjetas; objetivos táctiles ≥44 px. La **experiencia del respondiente de encuestas (§5 RESP) es mobile-first**.
- Ancho máx. de contenido 1440 px. Encabezado de página estándar: título, subtítulo, breadcrumbs, acciones primarias a la derecha.

### 3.4 Accesibilidad y calidad

WCAG AA (contraste, foco visible, `aria-*`, navegación por teclado completa, reordenar sin drag mediante botones ↑↓), `prefers-reduced-motion`, formularios con errores inline y resumen de errores, deshabilitar doble-envío, estados **loading / vacío / error / sin permiso** en toda pantalla.

---

## 4. ROLES Y NAVEGACIÓN

Leyenda: **●** permitido (confirmado en spec/decisiones) · **○** no permitido (confirmado) · **◐** no definido en spec → **usar la RLS real** (`permissions.ts`) · **L** solo lectura.

| Capacidad | Global | Director | Admin I.E. | Coordinador | Psicólogo | Docente |
|---|---|---|---|---|---|---|
| Inicio (dashboard propio) | ● | ● | ● | ● | ● | ● |
| Estudiantes: consultar | ● | ◐ | ◐ | ◐ | ● | ◐ (solo sus secciones) |
| Estudiante: registro completo | ◐ | ◐ | ◐ | ◐ | ● | ○ |
| Estudiante: **registro mínimo** (S14) | ◐ | ◐ | ◐ | ◐ | ● obligatorio | ○ |
| Períodos: cambiar sección / retirar / retorno | ◐ | ◐ | ◐ | ◐ | ◐ | ○ |
| Necesidad especial: gestionar | ● | ○ | ○ | ○ | ● | ○ |
| Necesidad especial: orientación informativa | ● | ○ | ○ | ○ | ● | ● (L) |
| Derivaciones | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ |
| Casos: consultar | ● | ◐ | ◐ | ● L | ● | ◐ |
| Casos: crear / cerrar / reabrir / reasignar | ● | ◐ | ◐ | ◐ | ● (cierre por Psicólogo autorizado) | ○ |
| Atenciones: registrar / editar (30 min) | ● bypass licencia | ◐ | ◐ | ◐ | ● (bloqueable por licencia) | ○ |
| Transferencias: solicitar (B) / autorizar-rechazar (A) | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ |
| **Encuestas: crear / editar / publicar / copiar** | ● | ● | ● | ● | ● | **○** |
| Encuestas: crear aplicación / ampliar plazo | ◐ | ◐ | ◐ | ◐ | ◐ | ○ |
| Encuestas: ver respuestas | ◐ | ◐ | ◐ | ◐ | ◐ | ○ |
| Responder encuesta (enlace + DNI) | — | — | — | — | — | ● (como respondiente) |
| Instituciones: crear / editar / eliminar | ● | ○ | ○ | ○ | ○ | ○ |
| Mi institución (datos, código modular) | ● | ◐ | ◐ | ○ | ○ | ○ |
| **Licencias: registrar / renovar** | ● | ○ | ○ | ○ | ○ | ○ |
| Aviso de licencia (banner) | — | ◐ | ◐ | ◐ | ◐ | ◐ |
| Usuarios: administrar | ● | ◐ (su I.E.) | ◐ (su I.E.) | ○ | ○ | ○ |
| Académico: niveles, asignaciones docentes | ◐ | ◐ | ◐ | ◐ | ○ | ○ |
| Promoción masiva | ◐ | ◐ | ◐ | ◐ | ○ | ○ |
| Auditoría | ● | ◐ | ◐ | ◐ | ○ | ○ |
| Analítica de uso | ● | ◐ | ◐ | ◐ | ◐ | ○ |
| Configuración / perfil propio | ● | ● | ● | ● | ● | ● |

**Menú lateral por rol** (mostrar solo lo permitido; ítem oculto ≠ seguridad):

- **Psicólogo:** Inicio · Mis casos (badge) · Atenciones (badge) · Derivaciones (badge) · Estudiantes · Encuestas · Transferencias · Analítica · Configuración.
- **Coordinador:** Inicio · Casos (consulta) · Estudiantes · Derivaciones · Encuestas · Promoción · Transferencias · Analítica · Configuración.
- **Docente:** Inicio · Mis estudiantes · Derivaciones (si la RLS lo permite) · Configuración.
- **Director / Admin. I.E.:** Inicio · Estudiantes · Casos (según RLS) · Encuestas · Académico · Usuarios · Mi institución · Promoción · Transferencias · Auditoría · Analítica · Configuración.
- **Global:** Inicio (panel global) · Instituciones · Licencias · Usuarios · Estudiantes · Encuestas · Promoción · Transferencias · Auditoría · Analítica · Configuración.

"Reportes" e "Historial clínico" del mockup **no son ítems propios**: Reportes → *Analítica de uso*; Historial clínico → pestaña *Historial* de la ficha de estudiante/caso.

---

## 5. CATÁLOGO DE PANTALLAS

Cada ID debe existir, funcionar con datos reales y tener prueba e2e.

### 5.1 AUTH — Acceso y registro

| ID | Ruta | Contenido |
|---|---|---|
| AUTH-01 | `/auth/login` | Layout dividido: izquierda visual futurista (degradado, forma abstracta, frase); derecha formulario correo + contraseña (mostrar/ocultar). Enlaces "¿Olvidaste tu contraseña?" y "Registrarme como docente". Errores genéricos (no revelar si el correo existe). Redirige al inicio según rol. |
| AUTH-02 | `/auth/registro` | **Wizard de 3 pasos.** (1) Código modular de I.E. → botón *Buscar* → `lookup_institution_by_code`. (2) **Preview**: nombre de la I.E. + niveles → "¿Es tu institución?" *Confirmar / Cambiar*. (3) Datos del docente (según `handle_new_user`) + contraseña + confirmación. Chip fijo "Rol: Docente" (no editable). Código inexistente → **no avanza**. El campo de código es **siempre obligatorio en la UI**; no existe opción de registrarse como Global. |
| AUTH-03 | `/auth/verifica-correo` | "Revisa tu correo", reenviar confirmación (con enfriamiento). |
| AUTH-04 | `/auth/callback` + estado de éxito | Procesa la confirmación (usa el *origin* de la request, no localhost); pantalla "Cuenta confirmada" → login. |
| AUTH-05 | `/auth/recuperar` | Correo → `resetPasswordForEmail`. Mensaje neutro siempre. |
| AUTH-06 | `/auth/nueva-clave` | `updateUser`, medidor de fortaleza, confirmación. |
| AUTH-07 | `/403`, `/404`, `/500`, sesión expirada, mantenimiento | Páginas de sistema con estilo del producto. **Sesión expirada = expiración normal de Supabase; nunca por licencia.** |

### 5.2 SHELL — Estructura global

| ID | Elemento | Contenido |
|---|---|---|
| SHELL-01 | Layout autenticado | Sidebar + topbar + área de contenido + banner de licencia; guardas de ruta por `permissions.ts`. |
| SHELL-02 | Sidebar | Ítems por rol (§4), badges de conteo, colapsable, ola inferior, footer con frase. |
| SHELL-03 | Topbar | Buscador, campana, fecha, menú de usuario (nombre, **rol único**, I.E.). |
| SHELL-04 | Búsqueda global / paleta `⌘K` | Busca **estudiantes por nombre/DNI** y salta a sus casos/atenciones. Resultados agrupados. **Nunca busca ni muestra contenido clínico.** Respeta RLS. |
| SHELL-05 | Notificaciones (campana) | Solo elementos derivados y accionables: licencias por vencer/vencidas, transferencias `pending` por autorizar (para A), promociones interrumpidas. No crear tabla nueva si ya existe la de alertas (T38). |
| SHELL-06 | Banner de licencia (`LicenseAlert`) | Franja fina superior. ≤30 días: ámbar "Tu licencia vence en N días". Vencida: rojo "Licencia vencida: las nuevas atenciones psicológicas están bloqueadas". **No bloquea navegación, no se puede ocultar cuando está vencida.** |
| SHELL-07 | Selector de ámbito (solo Global) | Elegir I.E. o "Todas". Los demás roles ven un chip fijo de su I.E. |
| SHELL-08 | Menú de usuario | Perfil, Configuración, tema, cerrar sesión. |
| SHELL-09 | Patrón de encabezado de página | Título, breadcrumbs, acciones, tabs. |
| SHELL-10 | Navegación móvil | Barra inferior + drawer. |

### 5.3 DASH — Inicio por rol

Estructura base (tomada de la referencia): saludo con avatar y frase → 4 KPI → tarjeta con tabs y lista → fila inferior de 3 tarjetas → panel de detalle derecho.

**DASH-PS · Psicólogo** (`/`)
- Saludo "Hola, Dra./Dr. {apellido}" + resumen del día.
- KPIs: **Atenciones recientes** (últimas 10) · **Casos en proceso** · **Casos en Inicio (sin primera atención)** · **Derivaciones sin Caso**. *(Reemplaza "Próximas atenciones", que es agenda y está fuera de alcance.)*
- Tabs: *Últimas atenciones · Mis casos · Derivaciones · Estudiantes*, con buscador, filtro de estado, filtro de rango y botón Filtros.
- Fila de lista: barra de color por estado, iniciales, nombre, situación · I.E., pill de estado, **contador "N atenciones"** (sin total ficticio), fecha de última atención, chevron.
- Inferior: **donut "Casos por estado"** (Inicio / En proceso / Cerrado, total al centro) · **Casos sin primera atención** · **Actividad reciente** (registró atención, creó derivación, actualizó caso; solo metadatos, sin contenido clínico).
- Panel derecho: detalle del caso seleccionado (ver CAS-03).

**DASH-CO · Coordinador:** KPIs institucionales (estudiantes con período activo, casos por estado en solo lectura, encuestas con aplicación abierta, avance de aplicaciones) · acceso a promoción y encuestas.
**DASH-DI/AD · Director / Admin. I.E.:** KPIs institucionales, estado de licencia, aplicaciones abiertas, usuarios por rol, accesos rápidos a Usuarios/Académico/Promoción. Solo conteos, sin contenido clínico.
**DASH-DO · Docente:** *Mis estudiantes* (según `asignaciones_docentes`) con tarjeta de **orientación informativa** cuando corresponda; accesos a sus datos. Sin nada clínico.
**DASH-GL · Global:** tarjetas de instituciones, **`ExpiringLicensesPanel`** (licencias por vencer ≤30 d y vencidas, por I.E., con acción "Renovar"), lotes de promoción recientes, usuarios recientes, transferencias `pending`.

### 5.4 EST — Estudiantes

| ID | Ruta | Contenido |
|---|---|---|
| EST-01 | `/estudiantes` | Lista + panel de detalle. Búsqueda por nombre/DNI. Filtros: I.E. (Global), año, nivel, grado, sección, estado del período (activo / retirado / egresado), con Caso abierto. Botones *Registrar estudiante* y *Registro mínimo* según rol. Tarjetas en móvil. |
| EST-02 | `/estudiantes/nuevo` | **Registro completo** (detalle abajo). |
| EST-03 | `/estudiantes/nuevo?modo=minimo` (también modal desde APL-03) | **Registro mínimo** (S14). |
| EST-04 | `/estudiantes/[id]` | **Ficha** con tabs (detalle abajo). |
| EST-05 | Drawer en EST-04 | Editar datos personales y opcionales (nacimiento, domicilio, contacto). |
| EST-06 | Tab *Familia* | Padre y madre (fijos), **un guardián/tutor operativo** con relación explícita, acción **Reasignar guardián** (conserva historial). |
| EST-07 | Tab *Períodos* | Línea de tiempo de períodos + acciones: **Cambiar de sección** (cierra y abre período), **Retirar** (motivo obligatorio, cierra), **Registrar retorno** (abre nuevo). Sin solapamientos: mostrar el error con claridad. |
| EST-08 | Tab *Documentos* | Subir a Supabase Storage (dropzone), listar, descargar con URL firmada, vista previa de PDF/imagen. Metadatos en BD. **Sin botón de eliminar documentos clínicos.** |
| EST-09 | Tab *Necesidad especial* | Ver NEC-01/NEC-02 según rol. |

**EST-02 · Registro completo — el flujo que hoy falla**

Formulario en **stepper lateral + resumen final**, guardado **en una sola RPC transaccional** (crea/actualiza `estudiantes`, `periodos_escolares`, `familiares`, y necesidad especial si aplica) + auditoría.

0. **Paso 0 — Verificar documento:** el usuario ingresa el DNI (o el tipo de documento que soporte el esquema). La verificación (server-side, respetando RLS/duplicados) devuelve:
   - *No existe* → continuar.
   - *Existe con período activo en mi I.E.* → mensaje y botón "Ir a la ficha".
   - *Existe con período activo en otra I.E.* → **no crear**; mostrar solo que existe una matrícula activa en otra institución (sin exponer datos personales) y explicar que debe retirarse/transferirse primero.
   - *Existe sin período activo (retirado/egresado)* → ofrecer **Retorno**: solo se abre un nuevo período (no se duplica al estudiante).
1. **Datos personales** → `estudiantes`: documento, nombres, apellidos, fecha de nacimiento (obligatorios).
2. **Matrícula / período** → `periodos_escolares`: I.E. (fija salvo Global), **año escolar**, **nivel** (los de la I.E.), **grado** (Primaria 1.º–6.º / Secundaria 1.º–5.º según nivel), **sección**, fecha de inicio (por defecto hoy), tipo. Validar no solapamiento.
3. **Familia** → `familiares`: **padre**, **madre**, **guardián/tutor operativo** con relación explícita (selector: padre, madre, abuelo/a, tío/a, hermano/a, otro + texto). Campos según la tabla real (nombres, documento, teléfono, correo, ocupación, etc.). El Psicólogo puede dejar opcionales los que el esquema permita.
4. **Datos opcionales:** nacimiento, domicilio, contacto.
5. **Necesidad especial (opcional)** — visible solo Psicólogo/Global; **no crea Caso**.
6. **Documentos (opcional).**
7. **Resumen y confirmar** → guarda todo o nada; redirige a EST-04 con toast de éxito.

Guardar borrador local del formulario (en memoria de la sesión, sin datos clínicos) para no perder el trabajo al cambiar de paso.

**EST-03 · Registro mínimo:** solo los datos básicos mínimos que exige la migración (documento, nombres, apellidos, fecha de nacimiento y, si el esquema lo exige, el período — ver §10 P2). Botón secundario "Completar más datos" que salta a EST-02. Rol: Psicólogo (obligatorio); **Docente no**. Al terminar, si vino desde una aplicación, vuelve a ella.

**EST-04 · Ficha:** cabecera como la referencia (avatar de iniciales, nombre, edad, grado/sección · I.E., chips: estado del Caso vigente, "Necesidad especial" solo PS/GL) y botón *Editar*. Tabs: **Resumen · Datos · Familia · Períodos · Casos · Derivaciones · Necesidad especial · Encuestas · Documentos · Historial**. Acciones rápidas (según rol): *Nuevo caso*, *Nueva derivación*, *Cambiar sección*, *Retirar*, *Registrar retorno*, *Subir documento*. La pestaña *Encuestas* lista aplicaciones del estudiante; ver respuestas solo con permiso.

### 5.5 ACA — Estructura académica

| ID | Ruta | Contenido |
|---|---|---|
| ACA-01 | `/academico/niveles` | Niveles configurables por I.E. (inicialmente Primaria y Secundaria) y grados fijos (Prim. 1–6, Sec. 1–5) en solo lectura. Activar/desactivar nivel si el esquema lo soporta. |
| ACA-02 | `/academico/asignaciones` | Asignar docentes a nivel/grado/sección/año (`asignaciones_docentes`); listar, crear, cerrar asignación. |
| ACA-03 | `/academico/secciones` | Nómina por año/nivel/grado/sección: estudiantes con período activo, conteos. Base visual para promoción. |

### 5.6 CAS — Casos

| ID | Ruta | Contenido |
|---|---|---|
| CAS-01 | `/casos` | Lista con las tabs *Mis casos · Todos · Sin derivación*. Filtros: estado (Inicio / En proceso / Cerrado), responsable, I.E., rango de apertura. Fila estilo referencia. Botón **Nuevo caso**. |
| CAS-02 | `/casos/nuevo` y drawer desde EST-04 | **Crear Caso** (detalle abajo). |
| CAS-03 | `/casos/[id]` (y panel derecho en CAS-01) | **Detalle del caso** (detalle abajo). |
| CAS-04 | Modal en CAS-03 | **Cerrar caso:** motivo de cierre obligatorio, confirmación, solo Psicólogo autorizado. Auditado. |
| CAS-05 | Modal en CAS-03 | **Reabrir caso:** Cerrado → Inicio; **motivo obligatorio**, se registra usuario; confirmación explícita. Auditado. |
| CAS-06 | Modal en CAS-03 | **Reasignar responsable:** selector de Psicólogos de la I.E.; crea entrada en historial (desde/hasta). |
| CAS-07 | Modo en CAS-03 | **Caso transferido (consulta):** banner "Transferido a {I.E.} el {fecha}. Solo consulta." Se ocultan todas las acciones de gestión; lo anterior a la transferencia muestra candado 🔒 "histórico inmutable". |

**CAS-02 · Crear Caso (hoy no existe en la UI)**
- Origen: desde la ficha del estudiante (estudiante precargado) o desde `/casos` (selector de estudiante con búsqueda).
- Campos: **estudiante** (obligatorio, con período activo), **situación** (obligatorio), **derivación** (opcional: elegir una derivación del estudiante que aún no tenga Caso, o "crear derivación ahora" con mini-formulario), **responsable actual** (por defecto el usuario Psicólogo; editable a otro Psicólogo de la I.E.).
- Reglas: estado inicial **Inicio**; una derivación ya vinculada **no** puede crear un segundo Caso; un Caso puede existir sin derivación; estudiante sin período activo no admite Caso.
- Crear un Caso **no** está bloqueado por licencia vencida (solo las nuevas atenciones).
- Éxito → redirige a CAS-03 con el CTA "Registrar primera atención".

**CAS-03 · Detalle del caso** (como el panel derecho de la referencia)
- Cabecera: volver a la lista, avatar, nombre, edad, grado · I.E., pill de estado, menú "⋯", *Editar caso*.
- Tabs: **Resumen · Atenciones (n) · Derivaciones (n) · Historial · Documentos**.
- Resumen: tarjeta *Información del caso* (situación, derivación de origen, responsable actual, apertura, última atención) + tarjeta *Estado del caso* con texto explicativo + **Evolución del caso** (stepper: Inicio → At.#1 … At.#n → Cierre, con fechas) + **Línea de tiempo** (derivación recibida, atenciones, cierre/reapertura, transferencia).
- Acciones rápidas: **Registrar atención** · **Nueva derivación / Vincular derivación** · **Reasignar responsable** · **Cerrar caso** / **Reabrir caso** · **Ver historial completo**. *(No incluir "Imprimir informe" ni "Próxima atención": fuera de alcance.)*
- Tab *Historial*: historial de responsables (desde/hasta), cierres y reaperturas con motivo y usuario, transferencias.
- Si hay una transferencia `pending`, mostrar banner informativo.

### 5.7 ATN — Atenciones

| ID | Ruta | Contenido |
|---|---|---|
| ATN-01 | `/atenciones` | Lista global de atenciones visibles: estudiante, caso, fecha, responsable, estado del caso. Filtros y paginación. Sin mostrar notas clínicas en la lista. |
| ATN-02 | `/casos/[id]/atenciones/nueva` (drawer/página) | **Registrar atención.** Campos = **columnas reales de `atenciones`** (auditar en Fase 0; el Specify no las detalla, ver §10 P6). Fecha/hora la fija el servidor. La primera atención pasa el Caso a **En proceso**. Con licencia vencida: botón deshabilitado con tooltip "Licencia vencida: nuevas atenciones bloqueadas" **y**, aunque el botón se habilite por error, manejar el rechazo del servidor con el mensaje de §7. |
| ATN-03 | `/casos/[id]/atenciones/[aid]` | Ver/editar. Chip con **cuenta regresiva de 30 min** calculada con hora del servidor ("Editable 24:31 restantes"). Al expirar: campos bloqueados, candado 🔒, mensaje "Ya no se puede editar (pasaron 30 minutos)". Si vence mientras edita: no perder el texto, ofrecer copiarlo. |
| ATN-04 | Panel en ATN-03 | **Historial de cambios** de la atención (quién/cuándo, solo metadatos) para roles con acceso a auditoría. |

### 5.8 DER — Derivaciones

| ID | Ruta | Contenido |
|---|---|---|
| DER-01 | `/derivaciones` | Lista con filtros (con/sin Caso, estudiante, fecha, derivador). Badge de conteo en el menú = derivaciones sin Caso. |
| DER-02 | `/derivaciones/nueva` | Estudiante, **fecha del evento** (el período se determina por esa fecha), **derivador** y **cargo** (se congela), registrador (automático), motivo, resumen, acciones previas, **adjunto opcional**, y "Crear Caso a partir de esta derivación" (toggle; no crea un segundo Caso si ya hay uno vinculado). Puede guardarse sin Caso. |
| DER-03 | `/derivaciones/[id]` | Detalle; acción **Vincular a un Caso como antecedente** sin reescribir la derivación. |

### 5.9 NEC — Necesidad especial

| ID | Dónde | Contenido |
|---|---|---|
| NEC-01 | Tab en EST-04 · Psicólogo/Global | Formulario y **proyección clínica**. Una sola entidad por estudiante. Aviso: "No crea un Caso". |
| NEC-02 | Tab en EST-04 y tarjeta en DASH-DO · Docente | **Orientación informativa** de solo lectura (misma condición, proyección para docentes). Debe consumir la vista/función de proyección, **nunca** la tabla clínica. |
| NEC-03 | `/necesidades-especiales` (opcional) | Listado para Psicólogo/Global con filtros. |

### 5.10 TRF — Transferencias (B solicita → A autoriza)

| ID | Ruta | Contenido |
|---|---|---|
| TRF-01 | `/transferencias` | Tabs: **Por autorizar** (soy A/origen) · **Solicitadas por mí** (soy B/destino) · **Historial** (`approved` / `rejected`). Estado como pill. |
| TRF-02 | `/transferencias/nueva` | B (destino) solicita: identificar el Caso/estudiante (mostrar solo datos mínimos, sin contenido clínico), I.E. de origen, y **nivel / grado / sección destino (obligatorios)**. Confirmación. Estado resultante `pending`, **sin efecto en A**. Si ya hay una `pending` para ese Caso, error claro. |
| TRF-03 | `/transferencias/[id]` | Detalle y línea de tiempo. Para A: **Autorizar** (diálogo que explica: cierra el período en A, crea período en B, transfiere responsabilidad, A conserva consulta) y **Rechazar** (motivo opcional, sin efectos). Registra eventos `transfer_requested / transfer_authorized / transfer_rejected`. |

### 5.11 IE y LIC — Instituciones y licencias (falla #3)

| ID | Ruta | Contenido |
|---|---|---|
| IE-01 | `/instituciones` (Global) | Tabla: código modular, nombre, niveles, **estado de licencia** (vigente / por vencer / vencida / sin licencia), usuarios, estudiantes activos. |
| IE-02 | `/instituciones/nueva` (Global) | **Wizard de 3 pasos — incluye la licencia.** Paso 1: datos de la I.E. (código modular, nombre, niveles habilitados, y los campos reales de la tabla). Paso 2: **Licencia**: uno o varios **códigos/serie** (chips), fecha de inicio, fecha de fin, con validación de no solapamiento. Paso 3: revisión y crear. Si el backend permite crear una I.E. sin licencia, ofrecer "Crear sin licencia" con advertencia "hasta registrar una licencia, las nuevas atenciones estarán bloqueadas" (ver §10 P4). Todo en **una transacción**. |
| IE-03 | `/instituciones/[id]` | Tabs: **Resumen · Datos · Licencias · Usuarios · Niveles · Estudiantes · Promoción**. Tarjeta de licencia con estado y días restantes. |
| IE-04 | Drawer en IE-03 | Editar datos de la I.E. |
| IE-05 | Zona de riesgo en IE-03 | **Eliminar I.E.** con `delete_institution`: si tiene cualquier período histórico, el servidor lo bloquea → mostrar "No se puede eliminar: tiene períodos históricos". Confirmación tipeando el código modular. No ofrecer alternativas inventadas. |
| IE-06 | `/mi-institucion` (Director/Admin) | Datos de la propia I.E., niveles, estado de licencia (L) y **código modular con botón "Copiar"** (lo necesitan los docentes para registrarse). |
| LIC-01 | `/licencias` (Global) | Tablero de todas las licencias: I.E., códigos, inicio, fin, **estado derivado por fechas** (futura / vigente / por vencer ≤30 d / vencida). Filtros y orden por vencimiento. |
| LIC-02 | Modal/página *Registrar licencia* (desde LIC-01 e IE-03) | I.E., códigos (uno o varios), fecha inicio, fecha fin. Valida fin > inicio y **sin solapamiento** con otras licencias de la I.E. |
| LIC-03 | Acción **Renovar** | **Renovación = nuevo registro** (nunca editar el anterior): abre LIC-02 con la I.E. y el inicio prefijado al día siguiente del fin actual. |
| LIC-04 | `ExpiringLicensesPanel` | Tarjeta en DASH-GL y en LIC-01: por vencer y vencidas, con días y acción Renovar. |
| LIC-05 | `LicenseAlert` | Ver SHELL-06. |

### 5.12 USR — Usuarios y perfil

| ID | Ruta | Contenido |
|---|---|---|
| USR-01 | `/usuarios` | Lista con filtros (rol, estado, I.E. para Global). Ámbito: Global todas; Director/Admin su I.E. (◐). |
| USR-02 | `/usuarios/[id]` | Datos, **selector de UN solo rol** (radio, no multiselección), activar/desactivar, I.E. (solo Global). **No hay "crear usuario con contraseña"**: los docentes se incorporan con el registro público + código modular; el rol se eleva aquí. Mostrar un aviso de cómo se incorporan usuarios. |
| USR-03 | `/configuracion/perfil` y `/seguridad` | Perfil propio, cambio de contraseña (Supabase), cierre de otras sesiones si el SDK lo soporta. El Global edita aquí sus propias credenciales (DC-006). |

### 5.13 ENC — Motor de encuestas (constructor)

| ID | Ruta | Contenido |
|---|---|---|
| ENC-01 | `/encuestas` | Biblioteca de la I.E.: tarjetas/tabla con nombre, versión vigente, nº de versiones, nº de aplicaciones, última aplicación. Tabs *Encuestas · Aplicaciones*. Botón **Nueva encuesta**. **Docente no ve este módulo.** |
| ENC-02 | `/encuestas/nueva` | Elegir **"Desde cero"** o **"Copiar una existente"** (lista según la autorización de `copy_survey`). |
| ENC-03 | `/encuestas/[id]` | Resumen: versiones (V1 🔒 en uso / V2 borrador…), aplicaciones, acciones *Editar versión, Nueva versión, Copiar encuesta, Nueva aplicación*. |
| ENC-04 | `/encuestas/[id]/versiones/[v]/editar` | **Constructor** (detalle abajo). |
| ENC-05 | Pantalla completa desde el constructor | **Preview**: mismos componentes que el respondiente; selector móvil / tablet / escritorio; banner "Vista previa — no se guardan respuestas". |
| ENC-06 | Diálogo | **Publicar versión:** lista de validaciones (≥1 sección, cada pregunta con enunciado, opciones válidas, escalas coherentes). Explica qué queda inmutable. |
| ENC-07 | Acción | **Nueva versión** de la misma encuesta (parte de la anterior). Solo se ofrece cuando la vigente está en uso. |
| ENC-08 | Diálogo | **Copiar encuesta:** nombre nuevo. Texto claro: "La copia es completamente independiente; los cambios no afectan a la original." **No** crea una versión de la original. |

**ENC-04 · Constructor (S05)**
- Barra superior: título editable, indicador de autoguardado, *Preview*, *Publicar*, estado de la versión.
- Layout de 3 zonas: **izquierda** esquema de secciones/preguntas (reordenable, con botones ↑↓ además de arrastrar); **centro** lienzo con tarjetas de sección y pregunta; **derecha** panel de propiedades de lo seleccionado.
- Operaciones: agregar/renombrar/reordenar/duplicar/eliminar sección y pregunta (eliminar solo en borrador), reordenar opciones.
- **9 tipos de pregunta** (menú con icono y descripción): texto corto · texto largo · opción única · selección múltiple · sí/no · número · fecha · escala · selección desde opciones.
- Propiedades comunes: enunciado, ayuda, obligatoria, **presentación**. Por tipo: opciones (etiqueta, valor, icono opcional para presentación visual), mín./máx. de selecciones (múltiple), mín./máx. y etiquetas de extremos (escala), rango y decimales (número), rango de fechas (fecha), máx. de caracteres (texto). Usar el JSONB de configuración existente; **no** crear tablas de tipos ni de componentes.
- **Presentaciones controladas** (el frontend elige el componente):

| Tipo | Normal | Visual / iconográfica |
|---|---|---|
| texto corto / largo | campo | — |
| opción única | radios | tarjetas con icono |
| selección múltiple | casillas | tarjetas/chips con icono |
| sí/no | interruptor segmentado | botones grandes ✓ / ✕ |
| número | campo numérico | stepper |
| fecha | selector de fecha | — |
| escala | segmentos numéricos | emojis / estrellas / deslizador |
| selección desde opciones | desplegable con búsqueda si >8 | — |

- Si la versión está **en uso**: modo solo lectura, banner "Esta versión ya fue utilizada y es inmutable" + botón *Crear nueva versión*. El servidor es la autoridad; la UI refleja el flag real.
- Sin lógica condicional/saltos (no está en el spec).

### 5.14 APL — Aplicaciones de encuestas

> El modelo real de `encuesta_aplicaciones` decide dos detalles (respondiente único por aplicación **o** enlace común con varios respondientes). Documéntalo en Fase 0 y construye APL-02/APL-03 para ese modelo; no inventes columnas. Ver §10 P1.

| ID | Ruta | Contenido |
|---|---|---|
| APL-01 | `/encuestas/aplicaciones` | Lista: encuesta + versión, año escolar, ventana (inicio–fin), **estado** (programada / abierta / vencida / cerrada), avance agregado. Filtros. |
| APL-02 | `/encuestas/aplicaciones/nueva` | **Wizard:** 1 Encuesta y versión publicada · 2 Año escolar/contexto · 3 Respondientes (estudiantes por nivel/grado/sección o individual; docentes) · 4 Ventana (inicio/fin, hora de Lima) · 5 Revisión. Si ya existe una aplicación para el mismo año, aviso **no bloqueante** "Se creará una nueva aplicación independiente". Termina en APL-05. |
| APL-03 | `/encuestas/aplicaciones/[id]` | Estado, ventana, progreso (anillo), tabla de respondientes/participantes (nombre, DNI, sin iniciar / en progreso / finalizada, % avance, última actividad). Acciones: *Ampliar plazo*, *Copiar enlace*, *Ver respuestas*, *Registrar estudiante* (si un DNI no está registrado, solo Psicólogo). |
| APL-04 | Diálogo | **Ampliar plazo:** nueva fecha/hora de fin (> actual). Texto: "Se mantiene la misma aplicación, el mismo enlace y el avance guardado." No crea aplicación. Funciona también si ya venció. |
| APL-05 | Pantalla/diálogo | **Enlaces:** copiar enlace (token firmado), copiar todos / descargar lista (solo roles autorizados). |
| APL-06 | `/encuestas/aplicaciones/[id]/respuestas` | Visor de respuestas por respondiente (solo lectura) y resumen agregado simple (conteos). Solo roles con permiso; contenido sensible protegido. |

### 5.15 RESP — Experiencia pública del respondiente (mobile-first, sin login)

Ruta pública: `/e/[token]`. Diseño propio: pantalla limpia, logo de la I.E., tarjeta central, controles grandes, barra de progreso fija, botones *Anterior / Continuar* fijos abajo. Debe verse como una app moderna, **no** como un formulario gigante ni una hoja de cálculo.

| ID | Pantalla | Contenido |
|---|---|---|
| RESP-01 | Validación del enlace | Verifica firma y ventana en servidor. Estados terminales: **enlace inválido**, **aún no disponible** (muestra cuándo abre), **vencida/cerrada** (muestra cuándo cerró, "consulta con tu I.E."). |
| RESP-02 | Ingreso de DNI | Campo grande, teclado numérico. Mensaje genérico si no coincide ("No encontramos un registro con este DNI para esta encuesta. Consulta con tu I.E."). Límite de intentos con enfriamiento. **No crea al estudiante.** |
| RESP-03 | Tus datos | Muestra los datos ya registrados (solo lectura) y **"Completa lo que falta"** (S15): datos adicionales, incluido padre/apoderado cuando corresponda. Con el mismo autoguardado. Verificar en el repo cómo quedó implementado. |
| RESP-04 | Secciones y preguntas | Una pregunta o grupo pequeño por pantalla; componentes según tipo y presentación (§5.13); progreso por sección; **autoguardado** (debounce ~800 ms + al cambiar de sección) con indicador "Guardado ✓"; manejo offline/reintento; navegación anterior/continuar; validación de obligatorias. |
| RESP-05 | Finalización | Revisión de pendientes obligatorias → confirmar → pantalla de agradecimiento. |
| RESP-06 | Recuperación | Volver con el mismo enlace + DNI restaura el avance y salta a donde quedó. |
| RESP-07 | Cambios de ventana en vivo | Si vence mientras responde: aviso "El plazo terminó; tu avance quedó guardado". Si se amplía: al reintentar puede continuar. Dos pestañas/dispositivos simultáneos: resolver conflictos sin perder respuestas. |

Debe funcionar igual para **Docente** como respondiente (datos cargados desde su perfil).

### 5.16 PRO — Promoción masiva (PREPARAR → REVISAR → EJECUTAR)

| ID | Ruta | Contenido |
|---|---|---|
| PRO-01 | `/promocion` | Lista de lotes: contexto (I.E., origen→destino), estado (`PREPARED / RUNNING / COMPLETED / FAILED / INTERRUPTED`), fecha, conteos. Botón **Nueva promoción**. Aviso si hay un lote recuperable. |
| PRO-02 | `/promocion/nueva` | **Wizard de 4 pasos** (detalle abajo). |
| PRO-03 | `/promocion/[loteId]` | Detalle: conteos, acciones (paginadas), **excepciones** (auditadas), línea de tiempo, botón *Reanudar* si `INTERRUPTED/FAILED`. |

**PRO-02 detalle**
1. **Ámbito:** I.E. (Global elige; los demás fija), **origen** (año anterior prefijado, editable), **destino** (año actual prefijado, editable). Ambos visibles.
2. **Preparar:** botón *Preparar lote* → `prepare_promotion` (crea `PREPARED`, **no muta datos**). Estado de carga.
3. **Revisar:** preview con conteos por grado (1.º→2.º …), badge de **cambio de nivel 6.º Prim → 1.º Sec** (`map_grade`), **egreso de 5.º Sec**, retirados excluidos, conflictos/solapamientos detectados, y tabla para marcar **excepciones** (repetidores) con motivo.
4. **Ejecutar:** confirmación reforzada (escribir "PROMOVER"), progreso en vivo (procesados/total), idempotente. Si se interrumpe → **Reanudar**. **Doble ejecución bloqueada** (botón deshabilitado + explicación si ya existe un lote completado para el contexto). **Sin opción de programar/automatizar**: la promoción es siempre manual (DC-011).

### 5.17 AUD, ANA, NOT, CFG

| ID | Ruta | Contenido |
|---|---|---|
| AUD-01 | `/auditoria` | "Quién hizo qué y cuándo": filtros (usuario, acción, entidad, I.E., fechas), tabla, drawer de detalle con metadatos. Acciones a soportar: cierre/reapertura de caso, edición de atención, `transfer_*`, promociones, licencias, cambios de rol. **Sin contenido clínico.** |
| ANA-01 | `/analitica` | Uso operativo: usuarios activos, atenciones registradas por período (**conteos**), casos por estado, encuestas aplicadas/completadas, promociones. **No** usa contenido clínico. Gráficos con la paleta del sistema. |
| NOT-01 | Panel de campana | Ver SHELL-05, con página `/notificaciones` para el historial. |
| CFG-01 | `/configuracion` | Tabs: *Perfil · Seguridad · Apariencia (tema claro/oscuro)* y, para Director/Admin, *Institución*. |

---

## 6. COMPONENTES COMPARTIDOS (crear una vez, reutilizar)

`AppShell`, `Sidebar`, `Topbar`, `CommandPalette`, `PageHeader`, `DataTable` (orden, filtros, paginación server-side, versión tarjeta en móvil), `FilterBar`, `MasterDetailLayout`, `KpiCard`, `DonutChart`, `Timeline`, `Stepper`, `WizardShell`, `StatusPill` (Caso / Transferencia / Lote / Aplicación / Licencia), `SegmentedCounter`, `Avatar` (iniciales), `EmptyState`, `ErrorState`, `Skeleton*`, `ConfirmDialog` (con confirmación tipeada), `Drawer`, `Toast`, `DateTimePicker` (Lima), `DocumentInput`, `StudentPicker`, `UserPicker`, `InstitutionSelect`, `ChipInput` (códigos de licencia), `FileDropzone`, `CopyButton`, `LockedBadge`, `ServerClockCountdown`, `LicenseBanner`, `Can` / `PermissionGate`, `SensitiveContent`, `AutosaveIndicator`, `ProgressRing`, `AuditEventRow`, y `SurveyQuestionRenderer` (9 tipos × presentaciones) **compartido por Preview y Respondiente**.

---

## 7. ERRORES DEL SERVIDOR → MENSAJES DE UI

| Situación | Mensaje / comportamiento |
|---|---|
| Licencia vencida al crear atención | "Licencia vencida: no se pueden registrar nuevas atenciones psicológicas. Contacta al administrador." La sesión sigue activa. |
| Atención fuera de ventana | "Esta atención ya no se puede editar (pasaron más de 30 minutos)." |
| Versión de encuesta en uso | "Esta versión ya fue utilizada y no se puede modificar. Crea una nueva versión." |
| Solapamiento de períodos | "El estudiante ya tiene un período que se cruza con estas fechas." |
| Documento duplicado | "Ya existe un estudiante con este documento." + enlace a la ficha si tiene acceso. |
| Transferencia `pending` existente | "Ya existe una solicitud pendiente para este caso." |
| Lote de promoción ya ejecutado | "Ya existe una promoción completada para este contexto." |
| Aplicación no disponible / vencida | Estados de RESP-01. |
| Código modular inexistente | "No encontramos una I.E. con ese código." (no avanza el registro) |
| Eliminar I.E. con histórico | "No se puede eliminar: tiene períodos históricos." |
| Sin permiso (RLS/403) | "No tienes permiso para ver esto." Sin filtrar existencia de datos. |
| Conflicto de edición | "Otra persona modificó este registro. Recarga para ver los cambios." |
| Red / timeout | Reintento, y en formularios largos no perder lo escrito. |

---

## 8. PRUEBAS (obligatorias)

Playwright contra Supabase local/staging, con verificación **en base de datos** de las filas creadas. Además `axe` (accesibilidad) en las pantallas principales. No basta con tests estáticos de SQL.

| E2E | Escenario |
|---|---|
| E2E-01 | **Registrar estudiante completo** (docente excluido) → verificar filas en `estudiantes`, `periodos_escolares` y `familiares`; con y sin necesidad especial. Casos DNI: nuevo / existente en mi I.E. / en otra I.E. / retorno. |
| E2E-02 | **Registrar I.E. con licencia** (códigos, fechas) → verificar `instituciones`, `licencias`, `licencia_codigos`. Renovar como nuevo registro. Solapamiento rechazado. |
| E2E-03 | **Crear Caso** desde la ficha y desde `/casos`, con y sin derivación; segunda vinculación rechazada. |
| E2E-04 | Registrar atención (Caso → En proceso), editar dentro de 30 min, bloqueo después (forzar el tiempo en el entorno de prueba). |
| E2E-05 | Cerrar caso (motivo) y reabrir (motivo) → estados y auditoría. |
| E2E-06 | Licencia vencida: login OK, navegación OK, **solo** crear atención bloqueada; Global con bypass; banner correcto. |
| E2E-07 | Transferencia: B solicita (sin efecto en A) → A autoriza (períodos, responsable) / A rechaza; origen queda en modo consulta. |
| E2E-08 | Promoción: preparar → revisar → ejecutar → interrumpir → reanudar; doble ejecución bloqueada; 6.º Prim→1.º Sec; egreso 5.º Sec; excepción de repetidor. |
| E2E-09 | Encuestas: crear con los 9 tipos y ambas presentaciones, preview, publicar, copiar (independiente), nueva versión, versión en uso inmutable. |
| E2E-10 | Aplicación: crear, enlace, DNI, responder con autosave, recuperar, finalizar, vencer, **ampliar plazo** (misma aplicación, mismo avance), segunda aplicación independiente en el mismo año. |
| E2E-11 | Estudiante no registrado: acceso denegado → Psicólogo registra mínimo → el estudiante ingresa y completa datos adicionales. |
| E2E-12 | Docente: no ve gestión de encuestas, no ve necesidad especial clínica, no registra estudiantes; sí responde encuestas. |
| E2E-13 | Registro docente: código válido → preview → confirmar → cuenta; código inválido no completa. Recuperación de contraseña. |
| E2E-14 | Usuarios: cambio de rol único; un usuario nunca queda con dos roles. |
| E2E-15 | Matriz allow/deny por rol para cada ruta de `permissions.ts`. |

---

## 9. FASES DE ENTREGA Y DEFINITION OF DONE

Trabaja **por fases**. Al cerrar cada una entrega: lista de IDs ✅, capturas de pantalla de cada uno (claro y oscuro, escritorio y móvil), resultado de los E2E, y `UI_COVERAGE.md` actualizado. **No avances a la siguiente fase sin aprobación.**

| Fase | Contenido |
|---|---|
| F0 | Auditoría (§2). |
| F1 | Sistema de diseño, SHELL-*, AUTH-*, `permissions.ts`, DASH base. |
| F2 | EST-*, ACA-*. (Cierra la falla #1.) |
| F3 | CAS-*, ATN-*, DER-*, NEC-*. (Cierra la falla #2.) |
| F4 | IE-*, LIC-*, USR-*. (Cierra la falla #3.) |
| F5 | TRF-*, PRO-*. |
| F6 | ENC-*, APL-*, RESP-*. |
| F7 | AUD-*, ANA-*, NOT-*, CFG-*, dashboards completos, pulido, E2E-15, reporte final. |

**Una pantalla está "hecha" solo si:** existe la ruta, guarda/lee datos reales, respeta permisos (server y UI), cubre estados loading/vacío/error/sin permiso, es responsive y accesible, tiene su E2E pasando y figura ✅ en `UI_COVERAGE.md`.

**Reporte final:** tabla completa de cobertura, lista de RPC/migraciones nuevas, diferencias entre esta especificación y la RLS real, y pendientes de §10 aún abiertos. Está prohibido escribir "proyecto listo" si hay algún ID en ❌ o 🟡.

---

## 10. PENDIENTES DE DECISIÓN (no inventar; preguntar al dueño)

1. **Modelo de aplicación:** ¿`encuesta_aplicaciones` es por respondiente único o un enlace común con varios respondientes identificados por DNI? Cambia APL-02, APL-03 y RESP-*.
2. **Registro mínimo (S14):** ¿incluye el período (I.E./año/nivel/grado/sección)? Sin período el estudiante puede no ser visible para su I.E. por RLS.
3. **Permisos marcados ◐** en §4: confirmar contra la RLS real y reportar diferencias.
4. **I.E. sin licencia:** ¿se permite guardar una I.E. sin licencia? ¿Qué pasa con las atenciones mientras tanto?
5. **Aviso de licencia:** el Specify dice que se alerta al Global; DC-004/009 hablan de un aviso interno sin decir a quién. ¿Lo ven todos los usuarios de la I.E.?
6. **Campos de `atenciones`:** el Specify no los detalla; usar los reales del esquema y confirmar cuáles son obligatorios.
7. **Transferencias:** ¿qué datos ve B del Caso de A antes de autorizar?, ¿cómo lo localiza?, ¿existe transferencia sin Caso? ¿Qué rol dentro de cada I.E. solicita y autoriza?
8. **Excepción de `handle_new_user` para el primer Global** (código vacío si no existe Global): aparece como prompt suelto dentro de `00_DECISIONES_CONFIRMADAS.md`, sin DC propia y en tensión con DC-012 ("registro público solo docente"). ¿Se aplicó? La UI **no** debe exponer esa vía; se necesita una DC que la formalice o la descarte.
9. **Documentos:** ¿se permite retirar/archivar? (por ahora no hay eliminación).
10. **Reapertura de caso:** ¿qué rol exacto puede hacerla?
11. **Versión publicada sin uso:** ¿sigue editable hasta tener respuestas?
12. **Encuesta finalizada:** si se amplía el plazo, ¿puede el respondiente reabrir y editar una encuesta ya finalizada?
13. **Presentación por sección** (una pregunta por pantalla vs. grupo pequeño): ¿existe en el esquema de configuración? Si no, proponer sin crear columnas sin avisar.

---

## 11. FUERA DE ALCANCE (aunque aparezca en la imagen de referencia)

Próximas atenciones, calendario/agenda, "Atención #4 / 6" con total planificado, botón *Imprimir informe*, estados "En seguimiento / En tratamiento" (usar solo Inicio / En proceso / Cerrado), fotos de estudiantes, campañas de encuestas, lógica condicional de encuestas, plantillas globales de encuestas, editor HTML libre, notificaciones por correo/WhatsApp/SMS, programación automática de promociones, ficha diagnóstica de 11 bloques, módulo `diagnosticos_anuales`.

---

## APÉNDICE — App docente (Expo, solo si T02 ya existe en el repo)

No es parte de las fases F1–F7. Si se pide más adelante: login, registro con código modular, *Mis estudiantes*, orientación informativa de necesidad especial (solo lectura), y apertura del enlace de encuesta. Mismo sistema de diseño (tokens de §3.1).
