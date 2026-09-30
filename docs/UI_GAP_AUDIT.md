# UI GAP AUDIT — Fase 0 (`08_UI_SPEC` §2)

> **Alcance:** solo lectura (excepto la creación de `web/lib/permissions.ts` exigido por §2c). No se modificó código de producto ni migraciones.
> **Fuentes:** migraciones `001–052`, `web/app/**`, `web/components/**`, `web/hooks/**`, `web/tests/**`, documentos `00–07`.
> **Fecha:** 28/09/2026 · **Estado:** ⏳ pendiente de aprobación del dueño antes de F1.

---

## A. Inventario de rutas y componentes (§2a)

### A.1 Rutas existentes (23 `page.tsx` + 1 route handler) → mapeo a IDs de §5

| Ruta | Archivo | Qué hace hoy | ID §5 relacionado | Estado |
|---|---|---|---|---|
| `/` | `app/page.tsx` | Landing + grid de módulos filtrado por rol (sin KPIs ni panel de detalle) | DASH-PS/CO/DI/DO/GL | 🟡 |
| `/auth/login` | `app/auth/login/page.tsx` | Server Action `signIn`, layout plano | AUTH-01 | 🟡 (falta layout dividido, enlaces completos) |
| `/auth/registro` | `app/auth/registro/page.tsx` | Wizard 2 pasos: código → `lookup_institution_by_code` → `signUp` | AUTH-02 | 🟡 (spec pide 3 pasos con preview "¿Es tu institución?") |
| `/auth/recuperar` | `app/auth/recuperar/page.tsx` | `resetPasswordForEmail` | AUTH-05 | 🟡 |
| `/auth/nueva-clave` | `app/auth/nueva-clave/page.tsx` | `updatePassword` | AUTH-06 | 🟡 (sin medidor de fortaleza) |
| `/auth/confirmacion` | `app/auth/confirmacion/page.tsx` | Placeholder estático | AUTH-03 | 🟡 (falta reenviar con enfriamiento) |
| `/auth/callback` | `app/auth/callback/route.ts` | `exchangeCodeForSession` → redirect | AUTH-04 | 🟡 (falta pantalla de éxito) |
| `/casos` | `app/casos/page.tsx` | Lista + búsqueda + filtro estado | CAS-01 | 🟡 (sin tabs Mis casos/Todos/Sin derivación, sin panel de detalle sticky) |
| `/casos/[id]` | `app/casos/[id]/page.tsx` | Detalle + atenciones (alta/edición) + historial + docs | CAS-03, ATN-02, ATN-03 | 🟡 |
| `/coordinador` | `app/coordinador/page.tsx` | Hub con `PromotionWizard`, licencias, selector I.E. | PRO-02 (embebido), DASH-CO | 🟡 (`/promocion` creada en F5) |
| `/encuestas` | `app/encuestas/page.tsx` | Lista + crear + copiar (usa `window.prompt`) | ENC-01 | 🟡 |
| `/encuestas/nueva` | `app/encuestas/nueva/page.tsx` | redirect → `/encuestas` | ENC-02 | 🟡 |
| `/encuestas/[id]` | `app/encuestas/[id]/page.tsx` | redirect → constructor | ENC-03 | 🟡 (falta resumen de versiones/aplicaciones) |
| `/encuestas/[id]/constructor` | `…/constructor/page.tsx` | Secciones/preguntas/opciones | ENC-04 | 🟡 (falta presentaciones, panel de propiedades completo, reordenar con ↑↓) |
| `/encuestas/[id]/preview` | `…/preview/page.tsx` | Preview de versión | ENC-05 | 🟡 (falta selector de dispositivos y banner) |
| `/encuestas/[id]/versiones` | `…/versiones/page.tsx` | `VersionManager` | ENC-06, ENC-07 | 🟡 |
| `/encuestas/[id]/aplicaciones` | `…/aplicaciones/page.tsx` | `ApplicationManager` (crear/ampliar/tokens) | APL-02, APL-03, APL-04, APL-05 | 🟡 (no es wizard de 5 pasos) |
| `/estudiantes/registro` | `app/estudiantes/registro/page.tsx` | Registro **mínimo** (DNI → insert estudiante) | EST-03 | 🟡 |
| `/instituciones` | `app/instituciones/page.tsx` | Lista + wizard de 3 pasos con niveles y licencia (`create_institution_with_license`, F4) | IE-01, IE-02 | 🟡 |
| `/instituciones/[id]`, `/mi-institucion`, `/licencias`, `/usuarios`, `/configuracion/perfil` `/seguridad` | `app/instituciones/[id]/page.tsx`, `app/{mi-institucion,licencias,usuarios}/page.tsx`, `app/usuarios/[id]/page.tsx`, `app/configuracion/{perfil,seguridad}/page.tsx` | **Creadas en F4** (7 tabs, licencias con renovar, ficha de usuario con rol único, mi institución con código copiable) | IE-03…06, LIC-01…05, USR-01…03 | 🟡 |
| `/personal` | `app/personal/page.tsx` | Alta de personal + cambio de rol (solo Global) — intacto por test protegido | (complemento de USR) | 🟡 (la alta con contraseña por Director sigue sin RPC) |
| `/transferencias`, `/transferencias/nueva`, `/transferencias/[id]` | `app/transferencias/**` | **Creadas en F5** (tabs, B solicita con DNI→caso vía `056`, detalle con autorizar/rechazar) | TRF-01…03 | 🟡 |
| `/promocion`, `/promocion/nueva`, `/promocion/[loteId]` | `app/promocion/**` | **Creadas en F5** (lista de lotes, wizard 4 pasos con `prepare/execute_promotion`, detalle con reanudar) | PRO-01…03 | 🟡 |
| `/analitica` | `app/analitica/page.tsx` | 9 tarjetas de conteo + filtro de período | ANA-01 | 🟡 (sin gráficos con paleta del sistema) |
| `/encuesta/[token]` (+`/acceso`, `/responder`) | `app/encuesta/[token]/**` | Flujo público: token + DNI + formulario con autosave | RESP-01…06 | 🟡 (ruta spec es `/e/[token]`; falta RESP-07) |

**No existen:** `error.tsx`, `not-found.tsx`, `loading.tsx` (AUTH-07 y estados de página).

### A.2 Componentes, hooks, pruebas, sistema de diseño

| Área | Hallazgo |
|---|---|
| Componentes | 33 archivos: 7 primitivas UI (`button, badge, modal, field, feedback, icons, stat-card`), `AppShell`+`nav`, módulos `casos/`, `documentos/`, `encuesta(s)/`, `licencias/`, `promocion/` |
| Componentes faltantes (§6) | `DataTable`, `Tabs`, `Stepper`, `WizardShell`, `Timeline`, `DonutChart`, `KpiCard` real, `CommandPalette`, `StatusPill`, `Drawer`, `Toast` (¡`sonner` instalado sin usar!), `Skeleton`, `Breadcrumb`, `DateTimePicker`, `StudentPicker`, `UserPicker`, `ChipInput`, `PermissionGate`, `ServerClockCountdown` |
| Hooks | 14 (`useUser`, `useEncuestas`, `usePromotion*`, `useAttention*`, `useLicenseStatus`…) |
| Permisos | **No existe `permissions.ts`** → creado en Fase 0 (§C). Lógica duplicada en **5 archivos** (`nav.ts`, `analitica`, `coordinador`, `HomeNav`, `personal`, `StudentDocumentsPanel`) |
| Pruebas | **Sin Playwright** (0 configs, 0 deps). 16 archivos Vitest, en su mayoría análisis estático de fuentes; ninguna ejecuta el navegador |
| Tokens | Tailwind v4 `@theme` en `globals.css` (paleta índigo). **Sin modo oscuro**, sin `dark:` ni `prefers-color-scheme` |
| Tipografía | Geist (spec pide Plus Jakarta Sans + Inter) |
| Sidebar/topbar | `AppShell` client: sidebar oscuro w-64 + drawer móvil ✓; **sin** ola SVG, frase motivacional, colapsable a riel, buscador, campana, chip de fecha |
| Seguridad de rutas | `middleware.ts` solo refresca sesión: **no redirige ni valida rol**; gating client-side + RLS |

---

## B. Matriz tabla → pantalla (§2b)

**Leyenda:** ✅ con UI funcional · 🟡 parcial · ❌ sin UI.

### B.1 Entidades

| Entidad | Crear | Ver | Editar | Pantallas §5 | Estado |
|---|---|---|---|---|---|
| `estudiantes` | 🟡 mínimo (`/estudiantes/registro`) | ❌ | 🟡 (`update_student` sin UI) | EST-01…05 | ❌ |
| `familiares` | ❌ | ❌ | ❌ | EST-06 | ❌ |
| `periodos_escolares` | ❌ (RPCs `create/close_school_period` sin UI) | ❌ | ❌ | EST-07 | ❌ |
| `niveles_educativos` / `grados` | ❌ (RLS los da a Director/Admin) | ❌ | ❌ | ACA-01 | ❌ |
| `asignaciones_docentes` | **❌ LA TABLA NO EXISTE EN LA BD** | ❌ | ❌ | ACA-02 | ❌ bloqueado |
| `encuestas` + versiones/secciones/preguntas/opciones | ✅ | ✅ | 🟡 | ENC-01…08 | 🟡 |
| `encuesta_aplicaciones` | 🟡 (modal, no wizard) | 🟡 | 🟡 ampliar plazo | APL-01…05 | 🟡 |
| `encuesta_respuestas` | ✅ (respondiente) | ❌ | ✅ (autosave) | APL-06, RESP-04 | 🟡 |
| `necesidades_especiales` | ❌ | ❌ | ❌ | NEC-01, NEC-02 | ❌ |
| `derivaciones` | ❌ | ❌ | ❌ (inmutable por spec) | DER-01…03 | ❌ |
| `casos` | ❌ **(ni UI ni RPC)** | 🟡 | 🟡 cerrar/reabrir sí | CAS-01…07 | 🟡 |
| `caso_responsables_historial` | ❌ (solo RPCs) | 🟡 (`ResponsibleHistory`) | ❌ (reasignar sin UI) | CAS-06 | 🟡 |
| `atenciones` | 🟡 embebida en caso | 🟡 | 🟡 con countdown 30 min | ATN-01…04 | 🟡 (falta ATN-01 y ATN-04) |
| `transferencias` | ✅ (B solicita, F5: `initiate_transfer` desde `/transferencias/nueva`) | ✅ (TRF-01/03, F5) | n/a (flujo por RPC) | TRF-01…03 | 🟡 |
| `institutions` | ✅ (wizard con niveles + licencia, F4) | ✅ (IE-03) | ✅ (IE-04) | IE-01…06 | 🟡 |
| `licencias` | ✅ (modal + renovar, F4) | ✅ (tablero `/licencias`) | ✅ (renovar = nuevo registro) | LIC-01…03 | 🟡 |
| `licencia_codigos` | ✅ (chips en LIC-02) | ✅ | n/a | LIC-02 | 🟡 |
| `perfiles` | 🟡 (`/personal` solo Global + `/usuarios` G,D; alta docente vía registro público) | 🟡 (`/usuarios`, `list_users`) | 🟡 (rol/I.E./activo en USR-02) | USR-01, USR-02 | 🟡 |
| `auditoria` | ✅ (automática) | ❌ | n/a | AUD-01 | ❌ |
| `lotes/acciones/excepciones_promocion` | ✅ (wizard `/promocion/nueva`, F5) | ✅ (lista + detalle `/promocion/[loteId]`) | ✅ excepciones (`PromotionExceptionsPanel`) | PRO-01…03 | 🟡 |
| `documentos` | ✅ | ✅ | ❌ (sin UPDATE en BD) | EST-08 | 🟡 |

### B.2 RPCs

| RPC | Backend | UI | Estado |
|---|---|---|---|
| `lookup_institution_by_code` | ✅ | ✅ (AUTH-02) | ✅ |
| `create/update/delete_institution` | ✅ | ✅ (IE-01/02/04/05; creación con licencia vía `create_institution_with_license`, `055`) | ✅ |
| `get_staff_list` / `admin_create_staff` / `admin_update_staff_role` | ✅ (solo Global) | 🟡 `/personal` + `/usuarios` (rol vía USR-02) | 🟡 |
| `list_users` / `admin_update_staff` | ✅ creadas en `055` (G,D / I.E.+activo) | ✅ USR-01/02 | ✅ |
| `create_license_with_codes` / `create_institution_with_license` | ✅ creadas en `055` | ✅ LIC-02/03, IE-02 | ✅ |
| `create_student` | ✅ (**solo inserta `estudiantes`**) | 🟡 | 🟡 |
| `update_student`, `upsert_family_member`, `delete_family_member` | ✅ | ❌ | ❌ |
| `create_school_period`, `close_school_period`, `get_student_periods` | ✅ | ❌ | ❌ |
| `check_student_duplicates_by_dni/by_name` | ✅ | 🟡 | 🟡 |
| `create_case` | **❌ NO EXISTE** | ❌ | ❌ |
| `close_case`, `reopen_case` | ✅ | ✅ (CAS-04/05) | ✅ |
| `create_attention`, `update_attention`, `enforce_attention_edit_window`, `can_create_attention` | ✅ | 🟡 | 🟡 |
| `initiate_transfer`, `authorize_transfer`, `reject_transfer` | ✅ (DC-007) | ✅ (TRF-01…03, F5) | ✅ |
| `prepare/preview/execute/resume_promotion`, `apply_promotion_exception`, `map_grade` | ✅ | ✅ (PRO-01…03, F5) | ✅ |
| `check_student_duplicates_by_dni`, `find_transferable_case` | ✅ (039 + **056 F5**) | ✅ (TRF-02) | ✅ |
| `get_expiring_licenses`, `get_license_status` | ✅ | ✅ (`/licencias` + `ExpiringLicensesPanel`, F4) | ✅ |
| `create_survey/copy_survey/create_survey_version/publish_survey_version/get_survey_versions` | ✅ | 🟡 | 🟡 |
| `create_survey_application`, `extend_survey_application` | ✅ | 🟡 | 🟡 |
| `validate_survey_access`, `get_survey_structure`, `submit_survey_response`, `complete_survey_application`, `get_application_responses` | ✅ | 🟡 (RESP) | 🟡 |
| `upload_document`, `list_student_documents`, `get_document_url`, `delete_document` | ✅ | ✅ | ✅ |
| `admin_*` staff, `delete_institution` | ✅ | ✅ | ✅ |

---

## C. Permisos reales → `web/lib/permissions.ts` (§2c)

Fuente única generada en **`web/lib/permissions.ts`** (capacidades + rutas). Regla: *ante duda manda la RLS*.

### C.1 Capacidades por rol (derivadas de RLS + guards de RPC)

| Capacidad | G | D | A | C | P | T | Fuente |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Estudiantes: consultar | ● | ● | ● | ● | ● | ● | `estudiantes_select_scoped` (045:371) |
| Registro estudiante (completo/mínimo) | ● | ● | ● | ● | ● | ○ | 039:28 + guard `create_student` (039:97) |
| Estudiante: editar datos | ● | ● | ● | ● | ○ | ○ | 039:36 |
| Familia / Períodos: gestionar | ● | ● | ● | ● | ○ | ○ | 014:161/180 + 024 |
| Documentos: ver/subir | ● | ● | ● | ● | ● | ○ | 035:35, 037:36 |
| Casos: consultar | ● | ● | ● | ● | ● | ● | `casos_select_scoped` (047:17) |
| Casos: crear/gestionar | ● | ● | ● | ● | ● | ○ | 047:27/40 |
| Atenciones: consultar | ● | ● | ● | ● | ● | ● | 047:61 |
| Atenciones: registrar/editar | ● | ● | ● | ● | ● | ○ | 047:72/86 + licencia server-side |
| Derivaciones: consultar | ● | ● | ● | ● | ● | ● | 045:64 |
| Derivaciones: crear | ● | ● | ● | ● | ● | ○ | 045:77 |
| Necesidad especial: consultar/gestionar | ● | ○ | ○ | ○ | ● | ○ | `*_select/manage_clinical` (049:1132/1145) |
| Necesidad: orientación docente (vista) | ● | ○ | ○ | ○ | ● | ● | vista `v_necesidades_docente` (018) |
| Encuestas: crear/editar/publicar/copiar | ● | ● | ● | ● | ● | ○ | `can_manage_surveys()` (028:21) |
| Encuestas: aplicaciones / ampliar plazo | ● | ● | ● | ● | ● | ○ | 028:242 |
| Encuestas: ver respuestas | ● | ● | ● | ● | ● | ● | 028:259/264 ⚠️ ver D |
| Instituciones: CRUD | ● | ○ | ○ | ○ | ○ | ○ | 014:85–93 |
| Mi institución (lectura) | ● | ● | ● | ○ | ○ | ○ | §4 + 014:81 |
| Licencias: registrar/renovar | ● | ○ | ○ | ○ | ○ | ○ | 014:431 |
| Licencias: ver (banner) | ● | ● | ● | ● | ● | ● | 014:427 |
| Usuarios: listar/crear/cambiar rol | ● | ● | ○ | ○ | ○ | ○ | 015:49/54/70/78/95 + RPCs solo Global |
| Académico: niveles/grados | ● | ● | ● | ○ | ○ | ○ | 014:105/124 |
| Promoción: preparar/ejecutar | ● | ● | ● | ● | ○ | ○ | guard `prepare_promotion` (049:103) |
| Transferencias: consultar | ● | ● | ● | ● | ● | ● | 014:393 |
| Transferencias: solicitar (B) | ● | ● | ● | ○ | ○ | ○ | guard `initiate_transfer` (048:101) + `permissions.ts` F5 |
| Transferencias: autorizar/rechazar (A) | ● | ● | ● | ○ | ○ | ○ | guard `authorize_transfer`/`reject_transfer` (048) + `permissions.ts` F5 |
| Auditoría: consultar | ● | ○* | ○* | ○* | ○ | ○ | 014:521 (*014:526 da solo **sus** eventos) |
| Analítica | ● | ● | ● | ● | ● | ○ | §4 |
| Dashboard / Configuración | ● | ● | ● | ● | ● | ● | — |

### C.2 Diferencias §4 (◐) resueltas contra la RLS real — REPORTE OBLIGATORIO

| # | §4 dice | RLS/RPC real | Resolución |
|---|---|---|---|
| 1 | Docente consulta estudiantes "solo sus secciones" (◐) | `estudiantes_select_scoped` da **todos** los estudiantes con período en la I.E. | RLS más amplia que el spec → **reportar**: ¿restringir por `asignaciones_docentes`? (tabla hoy no existe) |
| 2 | Director/Admin/Coord ◐ en registro completo | Permitido (039 + `create_student`) | Habilitar |
| 3 | Psicólogo ◐ en gestión de períodos | **NO** tiene UPDATE en `periodos_escolares` (014:161) | No habilitar en UI hasta crear RPC propia o ampliar RLS → **preguntar** |
| 4 | Coordinador: casos **solo lectura** ● L; crear ◐ | RLS le da INSERT/UPDATE en casos (047:27/40) | RLS más amplia; UI mostrará solo lectura por spec hasta decisión |
| 5 | Director/Admin/Coord ◐ en atenciones | RLS los permite (047:72/86) | Habilitar (licencia server-side aplica a todos salvo Global) |
| 6 | Usuarios: Admin I.E. ◐ | `perfiles`: admin_ie **sin** SELECT/INSERT/UPDATE (solo el propio) | **NO** habilitar `/usuarios` a Admin I.E. → reportar |
| 7 | Usuarios: Director ◐ | RLS sí le permite crear staff (015:78), pero `admin_create_staff` es **solo Global** | UI de Director requiere insert directo o RPC nueva → reportar |
| 8 | Auditoría: D/A/C ◐ | Solo ven **sus propios** eventos (014:526) | AUD-01 con esos roles mostraría subconjunto → reportar |
| 9 | Encuestas ver respuestas ◐ | 028:264 da SELECT a **cualquier rol de la I.E. (incluye Docente)** | ⚠️ Posible fuga de respuestas al Docente → **reportar como hallazgo P1** |
| 10 | Necesidad especial: Director/Admin ◐ | 049 da solo Global/Psicólogo; **pero** residuales 014 siguen dando SELECT a D/A/T | No confiar en residuales (ver E); UI: solo PS/GL + docente vía vista |
| 11 | Transferencias: todos ◐ | `048`: solicitar y autorizar son **G, D, A** (guards `initiate_transfer`/`authorize_transfer`, el Coordinador **queda fuera** aunque RLS 014 le dé INSERT) | **F5:** `permissions.ts` alineado al server 048 (`transferencias.solicitar/autorizar` = G, D, A) → **reportar** cambio de rol de solicitud D/C → D/A |
| 12 | Aviso de licencia ◐ (¿quién lo ve?) | Cualquier rol de la I.E. puede leer su licencia (014:427) | **Responder §10 P5:** banner a todos los usuarios de la I.E.; panel completo solo Global |
| 13 | Mi institución C/P/T ○ | RLS da SELECT de `institutions` propio a todos | Restringir la **pantalla** por spec (lectura inofensiva) |

---

## D. Esquemas reales que cambian la UI (§2d)

| Tabla | Columnas relevantes (reales) | Impacto en UI |
|---|---|---|
| `atenciones` | `motivo` **NOT NULL**, `que_se_hizo` **NOT NULL**, `observaciones`, `compromisos`, `proxima_atencion`, `origen`, `fecha` (DEFAULT `now()` → **hora servidor ✓**), `edited_at` (031) | **Responde §10 P6:** ATN-02 usa estos 7 campos. `proxima_atencion` existe pero la agenda está fuera de alcance V0: guardar sin mostrar en agenda |
| `casos` | `situation`→`situation`, `derivation_id`, `estado IN ('inicio','en_proceso','cerrado')`, `close_reason`, `current_responsible_id` | 3 estados del spec ✓; CAS-02 = `student_id + situation + derivation_id? + current_responsible_id` |
| `derivaciones` | `derivation_date`, `school_period_id` (se deduce de la fecha del evento ✓), `derivador_nombre/cargo` (se congelan ✓), `motivo`, `resumen`, `acciones_previas`, `adjunto_url`, `caso_id` | DER-02 cubre todos los campos |
| `estudiantes` | `first_names`, `last_names`, `document_type/number`, `birth_date` (NOT NULL), `birth_place`, `address`, `district` (021), `phone`, `email` — **sin columna de estado** | EST-01 filtra estado vía período (activo/retirado/egresado) |
| `periodos_escolares` | `school_year`, `nivel_id`, `grado_id`, `section`, `start_date`, `end_date`, `tipo IN ('regular','retiro','retorno')`, `motivo_retiro` + EXCLUDE sin solapamiento | EST-07: cambiar sección = cerrar+abrir; retirar = `tipo='retiro'` |
| `familiares` | `type IN ('padre','madre','guardian')`, `relationship`, **UNIQUE(student_id, type)** | Confirma EST-06: 1 padre, 1 madre, **1 solo guardián** |
| `necesidades_especiales` | `condition_type`, `clinical_description`, `teacher_orientation`, `certifying_entity`, `certification_date`, **UNIQUE(student_id, condition_type)** | ⚠️ El spec dice "**una sola** entidad por estudiante"; la BD permite varias por `condition_type` → **reportar**. `teacher_orientation` = NEC-02 docente |
| `transferencias` | + 048: `destination_nivel_id`, `destination_grado_id`, `section`, `school_year`, `authorized_at`, `rejected_at`, `reject_reason`; `status IN (pending,approved,rejected,completed)` | TRF-02 cubre nivel/grado/sección destino obligatorios (DC-007 ✓) |
| `licencias` / `licencia_codigos` | `start_date/end_date` + EXCLUDE sin solapamiento; `code UNIQUE` | LIC-02 valida fin>inicio y solapamiento (la BD ya lo rechaza) |
| `perfiles` | `role CHECK` en 6 roles, `institution_id`, UNIQUE(user_id) | Un solo rol activo ✓ (§1.3) |
| `encuesta_aplicaciones` | **`respondent_student_id` XOR `respondent_user_id` (`chk_respondent`)**, `year`, `section_name`, `grade_id`, `started_at/ends_at/extended_at`, `status` (6), `progress %`, `access_token TEXT UNIQUE` | **Responde §10 P1: respondiente ÚNICO por aplicación.** APL-02 debe crear **1 aplicación por respondiente** (masiva). ⚠️ `access_token` está **almacenado**, no firmado (≠ 04) → §10 P1 parcial |
| `encuesta_respuestas` | `application_id + question_id` UNIQUE, `answer JSONB` | Autosave por pregunta ✓ |
| `institutions` | `name`, `code` — niveles viven en `niveles_educativos` | IE-02 "niveles habilitados" = filas de niveles, no columnas |
| `documentos` | `filename`, `mime_type`, `size_bytes`, `storage_path`, `description` | EST-08 ✓; sin UPDATE en BD (035) |
| **`asignaciones_docentes`** | **NO EXISTE** | ACA-02 y DASH-DO bloqueados → nueva migración |

---

## E. RPC faltantes (§2e) — requieren migración **nueva** (053+)

| # | RPC propuesta | Pantalla | Motivo |
|---|---|---|---|
| 1 | `register_student_full(...)` | EST-02 | **Falla #1 confirmada en backend:** `create_student` solo inserta en `estudiantes`; no toca `periodos_escolares`, `familiares` ni `necesidades_especiales` |
| 2 | `verify_student_document(p_doc)` | EST-02 Paso 0 | Clasificar: nuevo / activo en mi I.E. / activo en otra I.E. / retirado (retorno). Hoy solo existen checks de duplicado |
| 3 | `change_school_section(...)` / `withdraw_student(...)` / `register_return(...)` | EST-07 | Existen `create_school_period` y `close_school_period` por separado; "cambiar sección" = 2 operaciones → debe ser 1 transacción (§1.10) |
| 4 | `create_case(...)` | CAS-02 | **Falla #2:** no existe RPC ni UI. Además `caso_responsables_historial` solo acepta INSERT de Global (047:119) → el alta de caso debe ser `SECURITY DEFINER` → **RESUELTA en F3:** `create_referral_with_case`/`create_derivation` en `054` (SECURITY DEFINER) + UI CAS-02/DER-02 |
| 5 | `create_referral_with_case(...)` | DER-02 (toggle) | derivación + caso en una transacción → **creada en `054`** (todo-o-nada + audit `derivation_created`/`case_created`) |
| 6 | `reassign_case_responsible(...)` | CAS-06 | UPDATE `casos` + INSERT/UPDATE historial (histórico solo lo escriben RPCs) → **creada en `054`** (sin solapamiento + audit `case_reassigned`) |
| 7 | `create_institution_with_license(...)` | IE-02 | **Falla #3:** `create_institution` solo recibe `name + code` (no niveles ni licencia) → **RESUELTA en F4:** creada en `055` (todo-o-nada: niveles subset + licencia + códigos + audit) con UI `InstitutionCreateWizard` |
| 8 | `create_license_with_codes(...)` | LIC-02/LIC-03 | `licencias` + `licencia_codigos` en 1 transacción con validación de solapamiento → **creada en `055`** (EXCLUDE traducido a mensaje claro + audit `license_created`) |
| 9 | `bulk_create_survey_applications(...)` | APL-02 | El modelo exige 1 aplicación por respondiente; crear N en lote |
| 10 | Tabla + CRUD `asignaciones_docentes` | ACA-02, DASH-DO, filtro docente de EST-01 | **Tabla inexistente en toda la BD** |
| 11 | `admin_create_staff` ampliado a Director (o nueva RPC) | USR-02 | Hoy `get_staff_list`/`admin_create_staff` son **solo Global** (052:41); RLS sí permite al Director crear staff de su I.E. → **parcial en F4:** `list_users()` (G,D) y `admin_update_staff` (I.E./activo) creadas en `055`; el alta con contraseña sigue sin RPC para Director |
| 12 | `complete_respondent_profile(...)` (token) | RESP-03 | El respondiente (anónimo) completa sus datos faltantes; RLS no permite INSERT/UPDATE anónimo en `estudiantes` → verificar si ya existe; si no, crearla |
| 13 | `create_derivation`, `link_case_derivation`, `list_institution_psychologists`, `list_attention_audit`, `server_now` | DER-02/03, CAS-06, ATN-03/04 | **Creadas en `054` (F3)**; `list_attention_audit` exige `auditoria.consultar` y oculta campos clínicos |

---

## F. Hallazgos de backend a reportar (no se arreglan en Fase 0)

1. **Políticas RLS residuales** (creadas y nunca dropeadas): `casos` FOR ALL de 036:20 (da DELETE al Psicólogo pese a `casos_delete_global`), `estudiantes` DELETE de 039:55, `caso_responsables_historial` FOR ALL de 036:61, `derivaciones`/`necesidades_especiales` SELECT de 014 (dan acceso a Director/Admin/Docente que 049 quería quitar) → limpieza en **migración nueva 053**.
2. **RPCs `SECURITY DEFINER` sin guarda de rol:** `map_grade` (033:8), `get_student_status` (021:360), `get_active_period` (023:302), `can_create_attention` (032:125).
3. **`reject_transfer`** no valida `reject_reason NOT NULL` pese a su comentario (048:55).
4. **Migración 051** aplica la excepción de bootstrap del primer Global **sin DC propia** (§10 P8): la UI no debe exponerla; se requiere DC que la formalice o descarte.
5. **Token de encuesta almacenado** en `encuesta_aplicaciones.access_token` en lugar de firmado (04) — documentar o corregir.
6. **`necesidades_especiales`**: `UNIQUE(student_id, condition_type)` ≠ "una sola entidad" del spec.
7. **`encuesta_respuestas` SELECT para Docente** vía política institucional (028:264) — ¿es deseable?
8. **Middleware sin guard de rutas**: toda la autorización de UI es client-side; la RLS es la única barrera (funciona, pero §1.2 pide además anticipación elegante).
9. **`web` no tiene Playwright** — F1 debe instalar `@playwright/test` + config (E2E-01…15 de §8).
10. **F3 — permisos UI vs backend:** la UI gatea `create_attention`/`update_attention`/`close_case`/`reopen_case` a G,P (como las RPC), pero `permissions.ts` da `atenciones.registrar/editar` y `casos.gestionar` a D,A,C; `create_case`/`reassign`/`create_derivation` aceptan G,P,D,A,C en backend pero la UI usa `casos.gestionar`/`derivaciones.crear`. **Decidir autoridad:** `permissions.ts` o RPCs.
11. **F3 — `auditoria.consultar`:** solo global en `permissions.ts` vs G,D,A,C en `list_attention_audit` (054) → alinear.
12. **F3 — RLS `institutions` SELECT global + propia:** el nombre de la I.E. destino de una transferencia **no es visible** para la I.E. origen → banner CAS-07 muestra "otra institución educativa" (decisión aceptada, reportar).
13. **F3 — ventana de edición (ATN-03):** `update_attention` (031) mide 30 min desde `created_at`, no desde `edited_at` → una segunda edición posterior a la primera expira antes; la UI usa `created_at` para ser fiel al backend. **Confirmar si debe ser desde `edited_at`.**
14. **F3 — `UNIQUE(student_id, condition_type)`** (§F.6): la UI asume entidad única por estudiante (crea solo si 0 filas, edita la primera) y traduce `23505` → **confirmar** semántica deseada.
15. **F3 — `asignaciones_docentes` sin `student_id`:** NEC-02 (orientación docente) filtra por nivel/grado/sección y luego nombra estudiantes best-effort con `.in("id", ...)` → si se cambia el modelo, revisar.
16. **F4 — `activo` es solo refuerzo parcial:** `055` reemplaza `get_user_role()`/`is_global_user()` con `AND activo`, pero las políticas/RPCs que leen `perfiles.role` con subquery inline (p.ej. 014:43, 052:160) **no** quedan bloqueadas para usuarios inactivos → el bloqueo total requiere revocar sesión del inactivo u otra migración.
17. **F4 — rol editable solo por Global:** `admin_update_staff_role` (052) es Global-only con whitelist institucional, pero `usuarios.gestionar` de spec/`permissions.ts` es G,D → la ficha USR-02 muestra el radio de rol deshabilitado para Director con nota "Solo Global modifica roles".
18. **F4 — Admin I.E. sin `/usuarios`:** spec §5.12 da A ◐ en USR-01, pero 015 no da SELECT de `perfiles` ajenos ni RPC equivalente → la lista queda gateada a G,D (misma discrepancia §C.2 #6, ahora con UI creada).
19. **F4 — datos personales en USR-02 solo lectura:** `admin_update_staff` (055) solo cambia `institution_id`/`activo` y `admin_update_staff_role` solo `role`; renombrar o corregir DNI no tiene RPC dedicada → la ficha los muestra como dato de cabecera.
20. **F5 — `permissions.ts` transferencias alineado al server 048:** `transferencias.solicitar` y `transferencias.autorizar` ahora = `["global","director","admin_ie"]` (antes solicitaban D/C y autorizaban D/G). El **Coordinador pierde** solicitud en la UI aunque RLS 014:402 le dé INSERT; el **Admin I.E. gana** ambas. Ningún test fija estos valores → **decidido (F.20):** se **mantiene G, D, A**. Fundamento: (a) §4 marca los roles de transferencia como ◐ → "usar la RLS real", y la capa real efectiva son los **guards de `048`** porque las RPCs son `SECURITY DEFINER` (bypassean RLS); (b) la UI nunca puede ofrecer una acción que el server rechaza (Coordinador recibiría "Solo Director o Admin I.E. pueden solicitar transferencias"); (c) RLS 014:402/410 queda como residuo muerto en el camino RPC (INSERT directo sin RPC no es un flujo soportado). **Si el dueño quiere al Coordinador solicitar, es cambio en el guard de `048` (server), no en la UI** → reportado.
21. **F5 — P7 resuelto con RPC nueva `find_transferable_case` (`056`):** B (G, D, A) localiza el estudiante/caso de otra I.E. vía `check_student_duplicates_by_dni` + `find_transferable_case`, exponiendo nombre, DNI, situación y estado (datos mínimos, sin contenido clínico). Decisión del dueño → **reportar** si debe acotarse por nivel de rol.
22. **F5 — "Conflictos/solapamientos" de PRO-02 sin campo server:** el spec §5.16 pide mostrar conflictos de duplicado pero `preview_promotion` no los expone → la UI muestra una nota honesta "no reportados por el servidor" (sin inventar datos) → si se requiere, añadir columna/retorno en `preview_promotion`.
23. **F5 — re-ejecución de promoción:** `049` permite crear un **segundo lote** en un contexto COMPLETED con `idempotency_key` distinta; la UI deshabilita "PROMOVER" si el lote ya corrió y muestra el literal §7 "Ya existe una promoción completada para este contexto." en hit idempotente. Doble clic ya protegido por el botón disabled + `already_processed` del server → sin doble ejecución accidental.
24. **F5 — `FAILED` no reanuda con `resume_promotion`:** el server solo acepta PREPARED/RUNNING/INTERRUPTED → PRO-03 usa `execute_promotion` con la misma `idempotency_key` para estados FAILED/PREPARED y `resume_promotion` para los demás (misma semántica que el resto de ejecuciones).
25. **F5 — panel de excepciones no invocable en el flujo real (confirmar):** `prepare_promotion` (049:82) crea el lote PREPARED **sin** acciones y `execute_promotion` (033:217) las crea y procesa en la misma transacción → el estado `pending` **nunca persiste** y `apply_promotion_exception` (033:479, exige `status='pending'`) no es alcanzable; en consecuencia el paso "Revisar" muestra siempre "No hay acciones pendientes para excepcionar." (captura e2e `pro-02-revisar`). **Preguntar:** ¿el panel debe operarse sobre acciones ya procesadas o hay que separar creación/ejecución en el server?
26. **F5 — `resume_promotion` solo voltea el status (confirmar):** `resume_promotion` (033:577) pasa el lote a RUNNING y exige `pending_count > 0` → "No hay acciones pendientes para reanudar" si es 0. Como `execute_promotion` procesa todo en la corrida, los lotes reales terminan COMPLETED sin pendientes persistidos y un "Reanudar" sobre ellos devuelve ese error (verificado y capturado: `pro-03b-reanudar-limitacion`); estados INTERRUPTED con pendientes son inalcanzables en el flujo normal → **preguntar** semántica deseada (¿interrupción real entre corridas?).
27. **F5 — `readCounts` con shapes distintos entre RPCs (corregido en UI):** `prepare_promotion` guarda `{promoted, retired}` y `execute_promotion` sobrescribe con `{processed, errors}` → lista/detalle mostraban "0 promovidos"; `web/lib/promocion.ts` ahora acepta ambos (fallback `processed → promoted`). Si se unifica en server, revisar la UI.
28. **F5 — RLS: la lista "Solicitadas por mí" muestra el fallback "Caso {id}":** el director destino (B) no tiene SELECT de `casos`/`estudiantes` de la I.E. origen → la fila no puede mostrar estudiante/situación (el wizard sí los obtiene vía `find_transferable_case`); el spec TRF-01 solo exige tabs + pill de estado → comportamiento aceptable y asertado en el e2e; si se quiere el dato en la lista haría falta una RPC/vista equivalente.
29. **F5 — triggers de máquina de estados (049 B2) impiden resets directos:** `enforce_caso_estado_transition` rechaza `en_proceso → inicio` (solo `en_proceso → cerrado` y `cerrado → inicio`) y `enforce_transfer_status_transition` solo admite `pending → approved|rejected` → fixtures/soporte deben encadenar transiciones permitidas (el e2e de F5 hace `en_proceso → cerrado → inicio`). Reportar para operaciones.

---

## G. Estado de los pendientes de §10 tras la auditoría

| # | Pendiente | Estado |
|---|---|---|
| P1 | Modelo de aplicación de encuestas | **RESUELTO (decisión delegada por el dueño, 29/09/2026):** **respondiente ÚNICO por aplicación.** Evidencia server: `chk_respondent` exige `respondent_student_id XOR respondent_user_id` (026:30), `progress` es por aplicación (1 respondiente), respuestas `UNIQUE(application_id, question_id)` y `access_token TEXT UNIQUE` por aplicación (026:27); `validate_survey_access` (029:301) resuelve token → aplicación → **un solo** respondiente y exige coincidencia de DNI (`document_number` del estudiante o del perfil del usuario). **Consecuencias para F6:** (a) enlace **NO común**: cada aplicación tiene su `access_token` propio; el DNI valida identidad, no selecciona respondiente entre varios; (b) APL-02 crea **1 aplicación por respondiente** → requiere la RPC `bulk_create_survey_applications` (§E.9) para operar en lote; (c) APL-03 "tabla de participantes" = listar las aplicaciones de la versión (cada fila = 1 aplicación/respondiente con su estado y progreso); (d) RESP-01..07 = token → `validate_survey_access` → flujo ya implementado en `/encuesta/[token]` |
| P2 | Registro mínimo: ¿incluye período? | **Abierto:** `create_student` no crea período. Sin período el estudiante no es visible por RLS institucional → **preguntar** |
| P3 | Permisos ◐ de §4 | **Resuelto** en §C.2 (13 diferencias reportadas) |
| P4 | I.E. sin licencia | **Parcial:** `create_institution` no crea licencia (se puede crear I.E. sin ella). ¿Permitirlo en UI? → **preguntar** |
| P5 | ¿Quién ve el aviso de licencia? | **Resuelto:** RLS permite leer la licencia de la I.E. a todos sus usuarios → banner a todos; panel de renovación solo Global |
| P6 | Campos de `atenciones` | **Resuelto** en §D (7 campos + `edited_at`) |
| P7 | Transferencias: qué ve B, quién solicita/autoriza | **Resuelto en F5:** B localiza el caso con `check_student_duplicates_by_dni` + `find_transferable_case` (RPC nueva `056`: datos mínimos sin contenido clínico; solo G, D, A); solo puede solicitar transferencia con Caso (`caso_id` NOT NULL); antes de autorizar, A ve **solo la fila de transferencia** con sus campos de destino (no el caso de la I.E. origen) |
| P8 | Excepción `handle_new_user` primer Global | **Abierto:** aplicada en 051 sin DC. UI no la expone |
| P9 | Documentos: ¿retirar/archivar? | **Abierto:** no existe función; spec prohíbe eliminación → por ahora, no |
| P10 | ¿Qué rol reabre casos? | **Parcial:** RLS permite Psicólogo/Director/Admin/Coord (047:40); spec dice "Psicólogo autorizado" → **preguntar** |
| P11 | Versión publicada sin uso: ¿editable? | **Parcial:** existe `check_version_has_responses`; la UI decide por el flag real de uso. Confirmar comportamiento server-side |
| P12 | Encuesta finalizada + ampliar plazo | **Abierto:** `extend_survey_application` existe; falta decidir si un respondiente finalizado puede reabrir → **preguntar** |
| P13 | Presentación por sección | **Abierto:** verificar si el JSONB de versión lo soporta; si no, proponer sin crear columnas |

---

## H. Conclusión de Fase 0

- **Backend muy por delante del frontend:** 56 migraciones vs. rutas F1–F5 creadas; ~20 IDs del catálogo sin ruta (ENC/APL/RESP/AUD/ANA/DCF).
- **Las 3 fallas confirmadas tienen raíz backend+frontend:** falta `register_student_full` (Falla #1), **`create_case` → RESUELTA en F3** (migración `054` + UI CAS/ATN/DER/NEC), **`create_institution_with_license` → RESUELTA en F4** (migración `055` + UI IE/LIC/USR).
- **F5:** transferencias y promoción cerradas con una RPC nueva en `056` (`find_transferable_case`, P7 del dueño), `permissions.ts` alineado al server 048 (§F.20) y **e2e reales en verde** (`web/e2e/f5-real-flows.spec.ts`: 4 tests, filas verificadas en BD alojada, 52 capturas en `docs/capturas/f5/`; suite completa 50/50, vitest 376, build ✓); hallazgos §F.25–§F.29 reportados → pendiente aprobación del dueño.
- **Entregables de Fase 0:** este informe + `docs/UI_COVERAGE.md` + `web/lib/permissions.ts`.
- **Siguiente paso (§9):** esperar **aprobación** de F5 para iniciar F6 (encuestas APL/ENC/RESP).
