# 4. PLAN — ACTUALIZADO

## Arquitectura
Web: Next.js + TypeScript. App docente: React Native + Expo + TypeScript. Backend/plataforma: Supabase Cloud.

## Patrón
Lecturas simples → Supabase con RLS.
Operaciones críticas → cliente → función server-side → validación → transacción PostgreSQL → auditoría → respuesta.

Usar Database Functions para operaciones transaccionales/data-intensive cuando simplifique integridad; Edge Functions para lógica server-side, integraciones o procesos adecuados al runtime.

## Entidades principales
estudiantes, familiares, periodos_escolares, niveles_educativos, grados, asignaciones_docentes, encuestas, encuesta_versiones, encuesta_secciones, encuesta_preguntas, encuesta_opciones, encuesta_aplicaciones, encuesta_respuestas, necesidades_especiales, derivaciones, casos, caso_responsables_historial, atenciones, transferencias, licencias, licencia_codigos, perfiles/roles, auditoria, lotes_promocion, acciones_promocion, excepciones_promocion, documentos/metadatos.

## Motor de encuestas

### Modelo
Se recomienda un modelo normalizado mínimo:
- `encuestas`
- `encuesta_versiones`
- `encuesta_secciones`
- `encuesta_preguntas`
- `encuesta_opciones`
- `encuesta_aplicaciones`
- `encuesta_respuestas`

No usar tabla genérica de tipos de pregunta, tabla de componentes visuales ni un único JSONB gigante que contenga toda la encuesta.

La pregunta mantiene su tipo, configuración y presentación estructurada. El frontend renderiza el componente correspondiente.

### Versiones
`encuesta_versiones` pertenece a `encuestas` y mantiene el número/estado de versión. Una versión que ya tenga uso/respuestas debe quedar inmutable.

Copiar una encuesta crea una nueva encuesta, no una nueva versión de la original.

### Aplicaciones
`encuesta_aplicaciones` representa cada aplicación concreta.

Debe registrar como mínimo:
- versión de encuesta;
- respondiente;
- contexto/año escolar cuando corresponda;
- fecha/hora de inicio;
- fecha/hora de fin;
- estado;
- avance;
- timestamps.

No imponer unique por persona/año. La repetición es una nueva aplicación independiente.

La ampliación del plazo actualiza la fecha/hora de fin de la misma aplicación y conserva el avance.

### Respuestas
`encuesta_respuestas` pertenece a una aplicación y pregunta. Debe permitir guardar las respuestas estructuradas sin crear columnas específicas por pregunta.

### Acceso por DNI y enlace
El enlace no requiere una tabla por enlace.

Recomendación técnica:
- generar token seguro firmado server-side;
- incluir referencia suficiente para identificar la aplicación;
- validar firma y ventana temporal en servidor;
- exigir DNI;
- resolver el respondiente;
- impedir acceso si no corresponde a la aplicación;
- no confiar en validaciones exclusivamente del frontend.

La aplicación puede ser reabierta dentro de una ventana ampliada sin crear otra.

### Registro mínimo de estudiante
Si el DNI no corresponde a un estudiante existente:
- el acceso no crea automáticamente al estudiante;
- el Psicólogo debe registrar previamente al estudiante;
- el registro puede ser mínimo;
- datos adicionales pueden completarse posteriormente dentro de la encuesta.

La operación de registro mínimo debe respetar RLS y permisos del rol.

### UX
Constructor de encuestas:
- modo edición;
- secciones;
- preguntas;
- tipos;
- configuración;
- presentación;
- preview;
- publicación.

Respondiente:
- acceso por enlace;
- DNI;
- carga de datos;
- secciones;
- progreso;
- navegación;
- autosave;
- recuperación;
- finalización.

No parecer hoja de cálculo ni formulario externo gigante.

## Caso/Atención
Transiciones server-side. Cierre y reapertura auditados. Historial de responsables con desde/hasta. Atención verifica hora de servidor y ventana de 30 minutos.

## Transferencia
Operación transaccional: validar autorización → registrar transferencia → actualizar responsabilidad operativa → fijar frontera temporal → mantener origen histórico → auditoría.

## Licencias
`licencias`: institution_id, start_date, end_date, created_by, created_at.
`licencia_codigos`: license_id, code, created_at.

Función server-side para determinar licencia activa. Job/scheduled function detecta fin dentro de 30 días y genera alerta sin duplicados. Evitar solapamientos.

## Promoción
Mantener lote, acciones, idempotencia, preview, ejecución por unidades controladas y reanudación.

## Documentos
Metadatos en PostgreSQL; archivos en Supabase Storage. Acceso coherente con registro y rol.

## Calidad
TypeScript estricto, validación de inputs, constraints DB, RLS, tests allow/deny, transacciones, idempotencia donde corresponda, pruebas de concurrencia, logs sin contenido clínico y staging antes de producción.
