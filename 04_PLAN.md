# 4. PLAN

## Arquitectura
Web: Next.js + TypeScript. App docente: React Native + Expo + TypeScript. Backend/plataforma: Supabase Cloud.

## Patrón
Lecturas simples → Supabase con RLS.
Operaciones críticas → cliente → función server-side → validación → transacción PostgreSQL → auditoría → respuesta.

Usar Database Functions para operaciones transaccionales/data-intensive cuando simplifique integridad; Edge Functions para lógica server-side, integraciones o procesos adecuados al runtime.

## Entidades principales
estudiantes, familiares, periodos_escolares, niveles_educativos, grados, asignaciones_docentes, diagnosticos_anuales, necesidades_especiales, derivaciones, casos, caso_responsables_historial, atenciones, transferencias, licencias, licencia_codigos, perfiles/roles, auditoria, lotes_promocion, acciones_promocion, excepciones_promocion, documentos/metadatos.

## Diagnóstico
`diagnosticos_anuales` con unique(student_id, school_year), form_version y responses JSONB. Schema separado de respuestas. Renderer dinámico. Autosave y recuperación. Proyección por rol mediante vistas/funciones permitidas. No devolver JSON clínico completo a roles sin permiso.

## Caso/Atención
Transiciones server-side. Cierre y reapertura auditados. Historial de responsables con desde/hasta. Atención verifica hora de servidor y ventana de 30 minutos.

## Transferencia
Operación transaccional: validar autorización → registrar transferencia → actualizar responsabilidad operativa → fijar frontera temporal → mantener origen histórico → auditoría. Los registros previos no se reescriben. Los nuevos eventos posteriores llevan contexto actual.

## Licencias
`licencias`: institution_id, start_date, end_date, created_by, created_at.
`licencia_codigos`: license_id, code, created_at.

Función server-side para determinar licencia activa. Job/scheduled function detecta fin dentro de 30 días y genera alerta sin duplicados. Evitar solapamientos.

## Promoción
`lotes_promocion`: institution_id, origin_year, destination_year, started_by, started_at, completed_at, status, counts, idempotency_key.
`acciones_promocion`: batch_id, student_id, source_period_id, destination_period_id, automatic_result, final_result, status, processed_at, error.

Crear restricciones para impedir duplicados. Ejecutar por unidades/chunks controlados. Registrar cada resultado. Reanudar tras interrupción.

## Documentos
Metadatos en PostgreSQL; archivos en Supabase Storage. Acceso al objeto coherente con registro y rol.

## UX
Formulario diagnóstico: móvil, por bloques, preguntas simples, progreso, autosave, recuperación y confirmación final. No debe parecer hoja de cálculo.

Caso: estudiante, grado/sección actual, situación, estado, responsable, timeline y acción principal Registrar atención. Acciones secundarias bajo Más.

Coordinador: panorama sin detalles clínicos innecesarios.

## Calidad
TypeScript estricto, validación de inputs, constraints DB, RLS, tests allow/deny, transacciones, idempotencia, pruebas de concurrencia, logs sin contenido clínico y staging antes de producción.
