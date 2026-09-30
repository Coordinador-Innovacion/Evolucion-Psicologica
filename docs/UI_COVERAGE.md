# UI_COVERAGE — Cobertura de pantallas (`08_UI_SPEC` §5)

> **Regla §2f/§9:** ningún ID es ✅ sin prueba e2e Playwright pasando contra Supabase local/staging verificando filas reales. Por eso **todos los IDs arrancan en ❌**, incluso cuando existe implementación parcial (columna `archivo` la indica).
> **Leyenda estado:** ❌ sin verificar / incompleto · 🟡 implementado y funcionando sin e2e · ✅ implementado + e2e pasando.
> **Columna test e2e:** referencia al E2E de §8 que lo cubrirá. **Playwright instalado** (`@playwright/test`, `npm run test:e2e`): F1 (smoke + axe), F2 (rutas EST/ACA), F3 (rutas CAS/ATN/DER/NEC), F4 (rutas IE/LIC/USR) y F5 (rutas TRF/PRO) corren **50 e2e y pasan** (46 UI-only + **4 F5 reales** contra Supabase alojado con verificación de filas: `web/e2e/f5-real-flows.spec.ts`, capturas en `docs/capturas/f5/`); F6 agrega **3 e2e reales** (`web/e2e/f6-surveys.spec.ts`, E2E-09/10/11) = **53 Playwright**.
> Roles: G=Global · D=Director · A=Admin I.E. · C=Coordinador · P=Psicólogo · T=Docente (fuente: `web/lib/permissions.ts`).

## AUTH — Acceso y registro

| ID | Ruta | Roles | Estado | Archivo | Test e2e |
|---|---|---|---|---|---|
| AUTH-01 | `/auth/login` | público | 🟡 | `web/app/auth/login/page.tsx` (split + mostrar/ocultar; e2e UI smoke ✓) | E2E-13 |
| AUTH-02 | `/auth/registro` | público (docente) | 🟡 | `web/app/auth/registro/page.tsx` (wizard 3 pasos; e2e UI smoke ✓) | E2E-13 |
| AUTH-03 | `/auth/verifica-correo` | público | 🟡 | `web/app/auth/verifica-correo/page.tsx` + `components/auth/VerifyEmail.tsx` (reenviar con cooldown) | E2E-13 |
| AUTH-04 | `/auth/callback` | público | 🟡 | `web/app/auth/callback/route.ts` → `/auth/cuenta-confirmada` | E2E-13 |
| AUTH-05 | `/auth/recuperar` | público | 🟡 | `web/app/auth/recuperar/page.tsx` (e2e UI smoke ✓) | E2E-13 |
| AUTH-06 | `/auth/nueva-clave` | público | 🟡 | `web/app/auth/nueva-clave/page.tsx` (medidor de fortaleza) | E2E-13 |
| AUTH-07 | `/403`, `/404`, `/500`, sesión expirada, mantenimiento | todos | 🟡 | `web/app/{403,404,500}/page.tsx`, `app/not-found.tsx`, `app/error.tsx` (mantenimiento: pendiente) | e2e UI smoke ✓ |

## SHELL — Estructura global

| ID | Ruta/Elemento | Roles | Estado | Archivo | Test e2e |
|---|---|---|---|---|---|
| SHELL-01 | Layout autenticado | todos | 🟡 | `web/components/layout/AppShell.tsx` (guard `canAccessPath` → `/403`) | E2E-15 |
| SHELL-02 | Sidebar por rol (badges, riel, ola, frase) | todos | 🟡 | `web/components/layout/AppShell.tsx` + `nav-badges.ts` | E2E-15 |
| SHELL-03 | Topbar (buscador, campana, fecha, menú) | todos | 🟡 | `web/components/layout/AppShell.tsx` | E2E-15 |
| SHELL-04 | Búsqueda global / paleta `⌘K` | todos | 🟡 | `web/components/layout/CommandPalette.tsx` (estudiantes por nombre/DNI; RLS; sin clínico) | requiere sesión+BD |
| SHELL-05 | Notificaciones (campana + `/notificaciones`) | todos | 🟡 | `web/components/layout/NotificationsBell.tsx`, `web/app/notificaciones/page.tsx`, `web/lib/alerts.ts` | requiere sesión+BD |
| SHELL-06 | Banner de licencia | todos (I.E.) | 🟡 | `web/components/layout/LicenseBanner.tsx` (franja; vencida no ocultable) | E2E-06 |
| SHELL-07 | Selector de ámbito | G | 🟡 | `web/components/layout/ScopeSelector.tsx` (chip fijo p/ demás roles) | requiere sesión |
| SHELL-08 | Menú de usuario | todos | 🟡 | `web/components/layout/UserMenu.tsx` (perfil, config, tema, salir) | requiere sesión |
| SHELL-09 | Encabezado de página | todos | 🟡 | `web/components/ui/page-header.tsx` | — |
| SHELL-10 | Navegación móvil (barra + drawer) | todos | 🟡 | `web/components/layout/AppShell.tsx` (`MobileBar` + drawer) | requiere sesión |

## DASH — Inicio por rol

| ID | Ruta | Roles | Estado | Archivo | Test e2e |
|---|---|---|---|---|---|
| DASH-PS | `/` (dashboard psicólogo) | P | 🟡 | `web/components/dashboard/DashboardShell.tsx` (KPIs + tabs, sin filtros avanzados) | requiere sesión+BD |
| DASH-CO | `/` (dashboard coordinador) | C | 🟡 | `web/components/dashboard/DashboardShell.tsx` (KPIs institucionales) | requiere sesión+BD |
| DASH-DI/AD | `/` (dashboard Director/Admin) | D, A | 🟡 | `web/components/dashboard/DashboardShell.tsx` | requiere sesión+BD |
| DASH-DO | `/` (dashboard docente) | T | 🟡 | `web/components/dashboard/DashboardShell.tsx` (tarjeta orientación; `asignaciones_docentes` creada en migración `053` — pendiente de aplicar → fallback activo) | requiere sesión+BD |
| DASH-GL | `/` (dashboard Global) | G | 🟡 | `web/components/dashboard/DashboardShell.tsx` (+ `ExpiringLicensesPanel`) | requiere sesión+BD |

## EST — Estudiantes

| ID | Ruta | Roles | Estado | Archivo | Test e2e |
|---|---|---|---|---|---|
| EST-01 | `/estudiantes` | todos (consultar) | 🟡 | `web/app/estudiantes/page.tsx` (lista + panel detalle, filtros, docente vía `asignaciones_docentes`) | E2E-01 |
| EST-02 | `/estudiantes/nuevo` (registro completo) | G, D, A, C, P | 🟡 | `web/app/estudiantes/nuevo/page.tsx` + `components/estudiantes/StudentWizard.tsx` (RPC `register_student_full`, borrador `ep:student-draft:v1`) | E2E-01 |
| EST-03 | `/estudiantes/nuevo?modo=minimo` | P (obligatorio), G, D, A, C | ✅ | `components/estudiantes/MinimalRegistration.tsx` (`verify_student_document` + `create_student`; legado en `app/estudiantes/registro/page.tsx` intacto; **e2e real E2E-11 ✓ rol D: verificar → registrar → fila en BD**) | E2E-01, E2E-11 |
| EST-04 | `/estudiantes/[id]` (ficha con tabs) | todos (consultar) | 🟡 | `web/app/estudiantes/[id]/page.tsx` + `components/estudiantes/StudentTabs.tsx` (10 tabs) | E2E-01 |
| EST-05 | Drawer editar datos personales | estudiantes.editar | 🟡 | `components/estudiantes/EditStudentDrawer.tsx` (`update_student`) | E2E-01 |
| EST-06 | Tab *Familia* + reasignar guardián | estudiantes.familia | 🟡 | `StudentTabs.tsx` → `upsert_family_member` | E2E-01 |
| EST-07 | Tab *Períodos* (cambiar sección/retirar/retorno) | estudiantes.periodos | 🟡 | `components/estudiantes/PeriodActions.tsx` (`change_school_section`, `withdraw_student`, `register_return`) | E2E-01 |
| EST-08 | Tab *Documentos* | documentos.* | 🟡 | `StudentTabs.tsx` → `components/documentos/StudentDocumentsPanel.tsx` (**sin botón de eliminar**; exports intactos) | E2E-01 |
| EST-09 | Tab *Necesidad especial* | necesidades.* | 🟡 | `StudentTabs.tsx` (clínica G/P; docente vía `v_necesidades_docente`) | E2E-01, E2E-12 |

## ACA — Estructura académica

| ID | Ruta | Roles | Estado | Archivo | Test e2e |
|---|---|---|---|---|---|
| ACA-01 | `/academico/niveles` | G, D, A | 🟡 | `web/app/academico/niveles/page.tsx` (`create_academic_structure`; grados fijos solo lectura) | E2E-01 |
| ACA-02 | `/academico/asignaciones` | G, D, A | 🟡 | `web/app/academico/asignaciones/page.tsx` (`create/close_teaching_assignment` + `list_institution_docentes`; tabla creada en migración `053`) | E2E-01 |
| ACA-03 | `/academico/secciones` | G, D, A | 🟡 | `web/app/academico/secciones/page.tsx` (nómina con período activo) | E2E-01 |

## CAS — Casos

| ID | Ruta | Roles | Estado | Archivo | Test e2e |
|---|---|---|---|---|---|
| CAS-01 | `/casos` | casos.consultar | 🟡 | `web/app/casos/page.tsx` (tabs Mis casos/Todos/Sin derivación, filtros, I.E. solo global; e2e UI rutas ✓) | E2E-03 |
| CAS-02 | `/casos/nuevo` + drawer desde ficha | casos.gestionar | 🟡 | `web/app/casos/nuevo/page.tsx` + `web/components/casos/CaseCreateForm.tsx` + drawers en `StudentTabs.tsx` (RPC `create_referral_with_case`, migración `054`) | E2E-03 |
| CAS-03 | `/casos/[id]` + panel derecho | casos.consultar | 🟡 | `web/app/casos/[id]/page.tsx` (stepper, línea de tiempo, 5 tabs, CTA `?nueva=1`) | E2E-03 |
| CAS-04 | Modal cerrar caso | casos.gestionar | 🟡 | `web/components/casos/CaseActions.tsx` (integrado en detalle, `canManage`) | E2E-05 |
| CAS-05 | Modal reabrir caso | casos.gestionar | 🟡 | `web/components/casos/CaseActions.tsx` (integrado en detalle, `canManage`) | E2E-05 |
| CAS-06 | Reasignar responsable | casos.gestionar | 🟡 | `web/components/casos/ReassignCaseModal.tsx` (RPC `reassign_case_responsible`, `054`) | E2E-05 |
| CAS-07 | Modo caso transferido (consulta) | casos.consultar | 🟡 | `web/app/casos/[id]/page.tsx` (banner transferido + acción deshabilitada; informe a ficha `TRF`) | E2E-07 |

## ATN — Atenciones

| ID | Ruta | Roles | Estado | Archivo | Test e2e |
|---|---|---|---|---|---|
| ATN-01 | `/atenciones` (lista global) | atenciones.consultar | 🟡 | `web/app/atenciones/page.tsx` (sin notas clínicas; e2e UI rutas ✓) | E2E-04 |
| ATN-02 | Registrar atención | atenciones.registrar | 🟡 | `web/app/casos/[id]/atenciones/nueva/page.tsx` + `web/components/casos/NewAttentionForm.tsx` (gate G,P; licencia; RPC `create_attention`, `032`) | E2E-04, E2E-06 |
| ATN-03 | Ver/editar + countdown 30 min | atenciones.editar | 🟡 | `web/app/casos/[id]/atenciones/[aid]/page.tsx` (hora servidor `server_now`; ventana 30 min; copiar texto al expirar; hook `useAttentionEdit`) | E2E-04 |
| ATN-04 | Historial de cambios de la atención | auditoria | 🟡 | `web/components/casos/AttentionAuditPanel.tsx` (RPC `list_attention_audit`, solo metadatos) | E2E-04 |

## DER — Derivaciones

| ID | Ruta | Roles | Estado | Archivo | Test e2e |
|---|---|---|---|---|---|
| DER-01 | `/derivaciones` | derivaciones.consultar | 🟡 | `web/app/derivaciones/page.tsx` (tabs Todas/Sin Caso/Con Caso; e2e UI rutas ✓) | E2E-04 |
| DER-02 | `/derivaciones/nueva` (incluye toggle crear Caso) | derivaciones.crear | 🟡 | `web/app/derivaciones/nueva/page.tsx` (adjunto `doc:` + toggle → RPC `create_referral_with_case`, `054`) | E2E-03 |
| DER-03 | `/derivaciones/[id]` (vincular como antecedente) | derivaciones.consultar | 🟡 | `web/app/derivaciones/[id]/page.tsx` (RPC `link_case_derivation`, descarga de adjunto) | E2E-03 |

## NEC — Necesidad especial

| ID | Ruta/Dónde | Roles | Estado | Archivo | Test e2e |
|---|---|---|---|---|---|
| NEC-01 | Tab en ficha (formulario + proyección clínica) | P, G | 🟡 | `web/components/estudiantes/StudentTabs.tsx` → `SpecialNeedTab` (alta/edición, aviso "No crea un Caso", `23505`) | E2E-12 |
| NEC-02 | Tab en ficha + tarjeta DASH-DO (orientación) | T (solo lectura) | 🟡 | `web/components/dashboard/DashboardShell.tsx` (card "Orientación informativa" desde `v_necesidades_docente`) | E2E-12 |
| NEC-03 | `/necesidades-especiales` (opcional) | P, G | 🟡 | `web/app/necesidades-especiales/page.tsx` (consulta + filtros; alta en NEC-01; e2e UI rutas ✓) | E2E-12 |

## TRF — Transferencias

| ID | Ruta | Roles | Estado | Archivo | Test e2e |
|---|---|---|---|---|---|
| TRF-01 | `/transferencias` (3 tabs) | transferencias.consultar | ✅ | `web/app/transferencias/page.tsx` (Por autorizar/Solicitadas por mí/Historial + pill; e2e UI rutas ✓ + **e2e real E2E-07 ✓**) | E2E-07 |
| TRF-02 | `/transferencias/nueva` (B solicita) | transferencias.solicitar (G, D, A) | ✅ | `web/app/transferencias/nueva/page.tsx` (DNI → `check_student_duplicates_by_dni` + `find_transferable_case` (056) + `initiate_transfer`; nivel/grado/sección obligatorios; **e2e real E2E-07 ✓**) | E2E-07 |
| TRF-03 | `/transferencias/[id]` (A autoriza/rechaza) | transferencias.autorizar (G, D, A) | ✅ | `web/app/transferencias/[id]/page.tsx` (línea de tiempo `transfer_*` + diálogos Autorizar/Rechazar → `authorize_transfer`/`reject_transfer`; **e2e real E2E-07 ✓**) | E2E-07 |

## IE — Instituciones

| ID | Ruta | Roles | Estado | Archivo | Test e2e |
|---|---|---|---|---|---|
| IE-01 | `/instituciones` | G | 🟡 | `web/app/instituciones/page.tsx` (tabla + filtros + estados de licencia; e2e UI rutas ✓) | E2E-02 |
| IE-02 | `/instituciones/nueva` (wizard con licencia) | G | 🟡 | `InstitutionCreateWizard` en `web/app/instituciones/page.tsx` + `web/app/instituciones/nueva/page.tsx` (`create_institution_with_license`, `055`; "crear sin licencia" → `create_institution` clásica) | E2E-02 |
| IE-03 | `/instituciones/[id]` (7 tabs) | G | 🟡 | `web/app/instituciones/[id]/page.tsx` (Resumen/Datos/Licencias/Usuarios/Niveles/Estudiantes/Promoción + `list_users`) | E2E-02 |
| IE-04 | Drawer editar I.E. | G | 🟡 | `web/app/instituciones/[id]/page.tsx` + modal en `web/app/instituciones/page.tsx` (`update_institution`) | E2E-02 |
| IE-05 | Zona de riesgo: eliminar I.E. | G | 🟡 | `web/app/instituciones/[id]/page.tsx` (tipeo de código + literal §7 "No se puede eliminar: tiene períodos históricos.") | E2E-02 |
| IE-06 | `/mi-institucion` | G, D, A | 🟡 | `web/app/mi-institucion/page.tsx` (datos, niveles, licencia `LicenseAlert`, código modular + **Copiar**) | E2E-02 |

## LIC — Licencias

| ID | Ruta | Roles | Estado | Archivo | Test e2e |
|---|---|---|---|---|---|
| LIC-01 | `/licencias` (tablero) | G | 🟡 | `web/app/licencias/page.tsx` (estados derivados, filtros, orden por vencimiento; e2e UI rutas ✓) | E2E-02, E2E-06 |
| LIC-02 | Registrar licencia (modal/página) | G | 🟡 | `web/components/licencias/LicenseFormModal.tsx` (fin > inicio, solapamiento client + servidor, RPC `create_license_with_codes`, `055`) | E2E-02 |
| LIC-03 | Renovar (nuevo registro) | G | 🟡 | `web/app/licencias/page.tsx` + `web/app/instituciones/[id]/page.tsx` (`nextDayISO` → `defaultStart`; nunca edita el anterior) | E2E-02 |
| LIC-04 | `ExpiringLicensesPanel` | G | 🟡 | `web/components/licencias/ExpiringLicensesPanel.tsx` (montado en `/licencias`, DASH-GL y `/coordinador`) | E2E-06 |
| LIC-05 | `LicenseAlert` (banner) | todos (I.E.) | 🟡 | `web/components/licencias/LicenseAlert.tsx` (en `/mi-institucion` y `/coordinador`) | E2E-06 |

## USR — Usuarios y perfil

| ID | Ruta | Roles | Estado | Archivo | Test e2e |
|---|---|---|---|---|---|
| USR-01 | `/usuarios` | G, D | 🟡 | `web/app/usuarios/page.tsx` (`list_users`, filtros rol/estado/I.E., aviso de incorporación; `/personal` intacto) | E2E-14, E2E-15 |
| USR-02 | `/usuarios/[id]` (rol único radio) | G, D | 🟡 | `web/app/usuarios/[id]/page.tsx` (radio → `admin_update_staff_role`; I.E./activo → `admin_update_staff`, `055`; aviso registro público) | E2E-14 |
| USR-03 | `/configuracion/perfil`, `/seguridad` | todos | 🟡 | `web/components/configuracion/ConfiguracionTabs.tsx` + `web/app/configuracion/{page.tsx,perfil/page.tsx,seguridad/page.tsx}` (tabs anidadas + "Cerrar otras sesiones" `signOut({scope:"others"})`) | e2e UI rutas ✓ |

## ENC — Motor de encuestas

| ID | Ruta | Roles | Estado | Archivo | Test e2e |
|---|---|---|---|---|---|
| ENC-01 | `/encuestas` | encuestas.gestionar (T ✗) | ✅ | `web/app/encuestas/page.tsx` (lista con títulos; **e2e real E2E-09 ✓: muestra creada + seed**) | E2E-09 |
| ENC-02 | `/encuestas/nueva` (cero o copiar) | encuestas.gestionar | ✅ | `web/app/encuestas/page.tsx` (cero en E2E-09 ✓; copiar vía `CopySurveyDialog` = ENC-08 ✓) | E2E-09 |
| ENC-03 | `/encuestas/[id]` (resumen) | encuestas.gestionar | ✅ | redirect a constructor (**e2e real E2E-09 ✓**) | E2E-09 |
| ENC-04 | `/encuestas/[id]/versiones/[v]/editar` (constructor) | encuestas.gestionar | ✅ | `web/app/encuestas/[id]/constructor/page.tsx` + `components/encuestas/constructor/*` (9 tipos + guardar + **e2e real E2E-09 ✓**) | E2E-09 |
| ENC-05 | Preview (selector de dispositivos) | encuestas.gestionar | ✅ | `web/app/encuestas/[id]/preview/page.tsx` (**e2e real E2E-09 ✓**) | E2E-09 |
| ENC-06 | Diálogo publicar versión | encuestas.gestionar | ✅ | `publish_survey_version` en VersionManager (**e2e real E2E-09 ✓: publish → filas**) | E2E-09 |
| ENC-07 | Acción nueva versión | encuestas.gestionar | ✅ | `web/components/encuestas/versiones/VersionManager.tsx` (**e2e real E2E-09 ✓**; **desvío spec**: gate `in_use` eliminado en toda la UI — nueva versión permitida siempre que exista contenido) | E2E-09 |
| ENC-08 | Copiar encuesta (diálogo) | encuestas.gestionar | ✅ | `copy_survey` + `CopySurveyDialog` en `web/app/encuestas/page.tsx` (**e2e real E2E-09 ✓: copia crea fila nueva**) | E2E-09 |

## APL — Aplicaciones de encuestas

| ID | Ruta | Roles | Estado | Archivo | Test e2e |
|---|---|---|---|---|---|
| APL-01 | `/encuestas/aplicaciones` (lista global) | encuestas.aplicaciones | ✅ | `web/app/encuestas/aplicaciones/page.tsx` (global) + `web/app/encuestas/[id]/aplicaciones/page.tsx` (por encuesta); **e2e real E2E-10 ✓ ambas rutas** | E2E-10 |
| APL-02 | `/encuestas/aplicaciones/nueva` (wizard 5 pasos) | encuestas.aplicaciones | ✅ | `web/components/encuestas/aplicaciones/ApplicationWizard.tsx` (aviso apps existentes; **e2e real E2E-10 ✓: fila creada +1**) | E2E-10 |
| APL-03 | `/encuestas/aplicaciones/[id]` (detalle/progreso) | encuestas.aplicaciones | ✅ | `web/components/encuestas/aplicaciones/ApplicationManager.tsx` / `ApplicationDetail` (**e2e real E2E-10 ✓**) | E2E-10 |
| APL-04 | Diálogo ampliar plazo | encuestas.aplicaciones | ✅ | `extend_survey_application` (**e2e real E2E-10 ✓: Vencida→Ampliada, 30% avance, fila `extended_at`/`ends_at`**) | E2E-10 |
| APL-05 | Enlaces (copiar/descargar) | encuestas.aplicaciones | 🟡 | diálogo "Enlaces de acceso" con URLs `/e/` (**apertura + URLs ✓ e2e**; botones copiar/descargar sin pulsar) | E2E-10 |
| APL-06 | `/encuestas/aplicaciones/[id]/respuestas` | encuestas.respuestas | ✅ | `web/app/encuestas/aplicaciones/[id]/respuestas/page.tsx` + `ApplicationAnswers` (visor solo lectura; **e2e real E2E-10 ✓**; fix: preguntas se cargan vía `encuesta_secciones`, no `version_id`) | E2E-10 |

## RESP — Respondiente público (mobile-first)

| ID | Pantalla | Roles | Estado | Archivo | Test e2e |
|---|---|---|---|---|---|
| RESP-01 | Validación del enlace | público (`/e/[token]`) | ✅ | `web/app/e/[token]/page.tsx` (ruta real de los enlaces; `/encuesta/[token]` legacy intacta; **e2e real E2E-10/11 ✓**) | E2E-10, E2E-11 |
| RESP-02 | Ingreso de DNI | público | ✅ | `web/components/encuesta/DniAccessForm.tsx` (**e2e real: verificación ✓ E2E-10 y denegación ✓ E2E-11**) | E2E-10, E2E-11 |
| RESP-03 | Tus datos / completa lo que falta | público | ✅ | `web/app/e/[token]/datos/page.tsx` (autoguardado refleja estado guardado; **e2e real E2E-11 ✓: fila `estudiantes.phone=999888777` + vista**) | E2E-11 |
| RESP-04 | Secciones y preguntas (autosave) | público | ✅ | `web/components/encuesta/ResponseForm.tsx` + `web/hooks/useSurveyResponse.ts` (**e2e real E2E-10 ✓: "Guardado ✓" + fila persistida**) | E2E-10 |
| RESP-05 | Finalización + agradecimiento | público | ✅ | `ResponseForm.tsx` (**e2e real E2E-10 ✓: completed + ≥7 respuestas**) | E2E-10 |
| RESP-06 | Recuperación (enlace + DNI) | público | ✅ | `web/hooks/useSurveyResponse.ts` (**e2e real E2E-10 ✓: reload recupera Sección 2/2 + 40%**; fix migración `061` hidratación + `resumeIndex` reescrito) | E2E-10 |
| RESP-07 | Cambios de ventana en vivo / 2 sesiones | público | 🟡 | `windowClosed` en `ResponseForm.tsx` (implementado; sin e2e) | E2E-10 |

## PRO — Promoción masiva

| ID | Ruta | Roles | Estado | Archivo | Test e2e |
|---|---|---|---|---|---|
| PRO-01 | `/promocion` (lista de lotes) | promocion.gestionar | ✅ | `web/app/promocion/page.tsx` (contexto, estados, conteos, aviso lote recuperable; e2e UI rutas ✓ + **e2e real E2E-08 ✓**) | E2E-08 |
| PRO-02 | `/promocion/nueva` (wizard 4 pasos) | promocion.gestionar | ✅ | `web/app/promocion/nueva/page.tsx` (Ámbito→Preparar→Revisar→Ejecutar: `prepare_promotion`/`execute_promotion`, confirmación "PROMOVER", `PromotionExceptionsPanel`; `/coordinador` con `PromotionWizard` intacto; **e2e real E2E-08 ✓**) | E2E-08 |
| PRO-03 | `/promocion/[loteId]` (detalle + reanudar) | promocion.gestionar | ✅ | `web/app/promocion/[loteId]/page.tsx` (conteos, acciones paginadas, excepciones auditadas, línea de tiempo, Reanudar → `resume_promotion`/`execute_promotion`) + `web/lib/promocion.ts` (**e2e real E2E-08 ✓**) | E2E-08 |

## AUD, ANA, NOT, CFG

| ID | Ruta | Roles | Estado | Archivo | Test e2e |
|---|---|---|---|---|---|
| AUD-01 | `/auditoria` | G | ❌ | — | — |
| ANA-01 | `/analitica` | G, D, A, C, P | ❌ | parcial: `web/app/analitica/page.tsx` (solo conteos) | — |
| NOT-01 | Campana + `/notificaciones` | todos | 🟡 | `web/components/layout/NotificationsBell.tsx`, `web/app/notificaciones/page.tsx` (requiere sesión+BD) | — |
| CFG-01 | `/configuracion` (tabs perfil/seguridad/tema) | todos | 🟡 | `web/app/configuracion/page.tsx` | — |

---

**Totales:** 96 IDs · ❌ = 2 · 🟡 = 68 · ✅ = 26 (F1: 11 + F2: 7 + F3: 11 + F4: 10 + F5: 7 = 46 e2e UI-only + 4 e2e F5 reales + 3 e2e F6 reales = **53 Playwright**; ✅ solo con filas reales en Supabase).
**Actualizado:** Fase 6 (ENC-01..08 + APL-01..06 + RESP-01..07 + EST-03) — 30/09/2026. F6 agrega `supabase/migrations/059_f6_survey_builder_application.sql` (columnas `in_use`, `sort_order` en secciones/preguntas/opciones + RPCs de encuesta) y `060_fix_restricted_search_path_pgcrypto.sql` (pgcrypto en `search_path` de `create_survey_application`/`bulk_create_survey_applications`/`admin_create_staff`) + `061_fix_get_application_responses_order_by.sql` (hidratación de respuestas), `supabase/seed_f6_e2e.sql` (encuesta seed + 5 aplicaciones con IDs fijos), tests `web/tests/flows/f6-surveys.test.ts` (43 estáticos) y **`web/e2e/f6-surveys.spec.ts` (3 e2e reales: constructor 9 tipos → publicar → copiar → nueva versión → inmutabilidad; aplicación 5 pasos → enlace → DNI → autosave → reload recupera → finalizar → ampliar plazo → visor de respuestas; acceso denegado → registro mínimo → datos → respondiente)**. Desvíos: ENC-07 (gate `in_use` eliminado de "nueva versión" en toda la UI), APL-05 (copiar/descargar sin pulsar en e2e), RESP-07 (sin e2e). Fix de sesión: `web/hooks/useUser.ts` reintenta ante fallos de red de auth (evita expulsar a login ante un `fetch failed` transitorio). Estabilidad e2e: `playwright.config.ts` mueve `outputDir` fuera de `web/` (Turbopack observaba `test-results/` y cada escritura disparaba un Fast Refresh de ~3s que estancaba el dev server) y las redirecciones UI-only de F2–F5 pasan de 15s a 45s de timeout; suite completa = **53/53 en ~4 min**.
**Fase 5:** TRF-01..03 + PRO-01..03 — 29/09/2026. F5 agrega `supabase/migrations/056_f5_transfer_case_lookup.sql` (RPC `find_transferable_case` — P7 resuelto por el dueño: B localiza el caso/estudiante de otra I.E. con datos mínimos), alinea `transferencias.solicitar/autorizar` con el server 048 (G, D, A), navegación `/transferencias` + `/promocion` y tests `web/tests/flows/f5-transfer-promotion.test.ts` (34 estáticos) + `web/e2e/f5-transfer-promotion.spec.ts` (7 UI-only) + **`web/e2e/f5-real-flows.spec.ts` (4 e2e reales E2E-07/E2E-08 contra Supabase alojado: solicitar → autorizar → rechazar y promoción preparar → revisar → ejecutar con verificación de filas en BD, idempotencia vía RPC y 52 capturas en `docs/capturas/f5/`)**; `web/lib/promocion.ts` acepta la forma `{processed, errors}` de `execute_promotion` (corrige "0 promovidos").
**Fase 4:** IE-01..06 + LIC-01..05 + USR-01..03 — 29/09/2026. F4 agrega `supabase/migrations/055_f4_institution_license_user.sql` (columna `perfiles.activo`, `create_license_with_codes`, `create_institution_with_license`, `list_users`, `admin_update_staff`) y tests `web/tests/flows/f4-institution.test.ts` (25 estáticos) + `web/e2e/f4-institution.spec.ts` (10 UI-only); la verificación E2E-02 de filas reales queda pendiente sin BD local.
**Fase 2:** EST-01..09 + ACA-01..03 — `053_f2_student_registration_and_academic.sql` + `est-aca.test.ts` + `f2-est-aca.spec.ts` (7 UI-only).
