# 5. TASKS — ACTUALIZADAS

## Base existente
T01 proyecto Next.js/TS; T02 Expo/TS; T03 Supabase local/staging; T04 migraciones/tipos; T05 Auth/perfiles; T06 RLS base.

T07 niveles/grados; T08 instituciones; T09 estudiantes; T10 familiares; T11 períodos y restricciones.

## Reemplazo del antiguo diagnóstico por encuestas
Las tareas antiguas de diagnóstico T12-T20 quedan reemplazadas por:

**S01 Modelo de encuestas:** crear migraciones para `encuestas`, `encuesta_versiones`, `encuesta_secciones`, `encuesta_preguntas`, `encuesta_opciones`, `encuesta_aplicaciones`, `encuesta_respuestas`.

**S02 Constraints e integridad:** relaciones, órdenes, estados, versión utilizada inmutable y consistencia de aplicaciones/respuestas.

**S03 RLS y permisos:** Global, Director, Administrador I.E., Coordinador y Psicólogo pueden gestionar encuestas; Docente no puede crear/editar/publicar. Aplicaciones y respuestas protegidas por rol, institución, respondiente y contexto.

**S04 Tipos/configuración:** tipos iniciales de pregunta, configuración JSONB de pregunta y presentación estructurada. No tabla genérica de tipos ni componentes visuales.

**S05 Constructor:** modo edición, secciones, preguntas, opciones, configuración y presentación.

**S06 Preview:** previsualización de la encuesta antes de publicar.

**S07 Publicación/versionado:** publicación de versiones e inmutabilidad de versiones utilizadas.

**S08 Copia independiente:** copiar una encuesta creando otra encuesta independiente, sin vínculo de edición con la original.

**S09 Aplicaciones:** crear aplicaciones independientes para cada aplicación concreta, sin restricción artificial de una por persona/año.

**S10 Ventana temporal:** fecha/hora de inicio y fin; disponibilidad según servidor.

**S11 Ampliación de plazo:** permitir a rol autorizado ampliar el fin de una aplicación sin crear otra y conservar el avance.

**S12 Enlace seguro:** generar y validar token firmado server-side sin tabla por enlace.

**S13 Acceso por DNI:** validar respondiente, aplicación y contexto; cargar datos existentes.

**S14 Registro mínimo de estudiante:** flujo obligatorio para Psicólogo cuando el estudiante no existe; solo datos básicos mínimos obligatorios; datos adicionales opcionales para el Psicólogo.

**S15 Datos adicionales en encuesta:** permitir que el estudiante complete dentro de la encuesta la información adicional requerida, incluyendo padre/apoderado cuando corresponda.

**S16 Captura web:** experiencia responsive por secciones, progreso, navegación, autosave, recuperación y finalización.

**S17 Componentes visuales:** implementar componentes codificados en frontend según tipo/presentación; no almacenar HTML/React en DB.

**S18 Respuestas:** guardar respuestas por aplicación/pregunta, con recuperación y persistencia segura.

**S19 Repetición:** comprobar que una segunda aplicación sea un nuevo registro independiente y no modifique la aplicación anterior.

**S20 Año/contexto:** conservar año escolar y contexto de cada aplicación.

**S21 Pruebas de seguridad:** allow/deny por rol, institución, respondiente, DNI, enlace, aplicación vencida y aplicación ampliada.

## Resto del sistema
T21 necesidad especial; T22 vista Psicólogo; T23 vista Docente.

T24 derivaciones; T25 Casos/estados; T26 historial responsables; T27 Atenciones; T28 ventana 30 min; T29 cierre/reapertura; T30 auditoría.

T31 transferencia; T32 frontera de congelamiento; T33 continuidad Caso abierto; T34 consulta institución origen; T35 concurrencia/auditoría.

T36 licencias/códigos; T37 estado por fecha; T38 alerta 30 días; T39 vencida=NO cambia roles, solo bloquea nuevas atenciones psicológicas (DC-003); T40 bypass Global; T41 renovación como nuevo registro; T42 sesión activa.

T43 wizard promoción; T44 prefill; T45 mapeo grado; T46 Egreso; T47 preview; T48 lote/idempotencia; T49 reanudación; T50 excepciones; T51 auditoría; T52 doble ejecución/interrupción/solapamientos.

T53 Storage; T54 UX Caso; T55 UX Coordinador; T56 analítica; T57 errores/observabilidad.

T58 unit tests; T59 integración; T60 RLS; T61 Caso; T62 transferencia; T63 licencias; T64 promoción; T65 revisión quirúrgica; T66 CONVERGE.

## T66 — CONVERGE FINAL (MI MO)
- A1 DC-007: transferencias B solicita → A autoriza (048).
- A2 DC-008: `claim_first_global` one-shot (049).
- A3 DC-009: aviso licencia sin cortar sesión (ya en UI).
- A4 DC-010: `prepare_promotion` PREPARED + execute solo lotes preparados (049 + wizard).
- A5 DC-011: promoción manual; map_grade 6.º→1.º Sec; egreso 5.º Sec.
- B1–B4 en 049 (authz DEFINER, triggers máquina de estados, necesidades clínicas, delete_institution con histórico).
- B5: documentar/cerrar período seed 2026 antes de T64 si afecta EXCLUDE.
- B6: evidenciar pgcrypto/pg_trgm sin cambiar.
- B7: NO restaurar 016–018.
- Actualizar 00_DECISIONES, 05/06/07; suite completa; reporte G.

## Orden recomendado
Datos → constraints → seguridad → reglas → operaciones server-side → UI → pruebas → revisión quirúrgica.
