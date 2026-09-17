# 7. CONVERGE

## Revisión final

### Identidad
Estudiante único; períodos sin solapamiento; contexto histórico preservado.

### Roles
Un rol activo; permisos server-side; ausencia de acceso clínico indebido.

### Diagnóstico
Uno por estudiante/año; formVersion; schema válido; JSONB; autosave; recuperación; copia anual; 11 bloques; proyecciones por rol; protección de preguntas sensibles.

### Necesidad especial
Una condición por estudiante; mismo registro con proyección clínica/informativa; no crea Caso automáticamente.

### Derivaciones
Puede existir sin Caso; Caso puede existir sin derivación; enlace no crea segundo Caso; historial no se reescribe.

### Caso
Inicio; primera Atención → En proceso; En proceso → Cerrado; reapertura Cerrado → Inicio; primera nueva Atención → En proceso; cierre/reapertura auditados.

### Atención
Histórica; edición solo 30 minutos con hora servidor; después bloqueada; cambios auditados.

### Transferencia
Autorización correcta; historial previo congelado; Caso abierto continúa; origen solo consulta; destino gestiona nuevas acciones; auditoría completa.

### Licencias
Códigos; inicio/fin; alerta 30 días; renovación como nuevo registro; vencida = Coordinador; Global = acceso total; sesión activa no evade vencimiento.

### Promoción
Origen/destino visibles; prefill; preview; mapeo automático; último grado = Egreso; retirados excluidos; repetidores por excepción; lote idempotente; reanudación; doble ejecución bloqueada; excepciones auditadas; sin duplicados ni solapamientos.

### Seguridad
Probar allow/deny por rol, institución, diagnóstico, transferencia y licencia vencida.

### Concurrencia
Probar doble promoción, doble transferencia, cambios de responsable concurrentes, edición cerca de minuto 30 y vencimiento durante operación.

## Criterio final
Solo declarar **PROYECTO LISTO PARA DESARROLLO** cuando no existan huecos críticos conocidos y las decisiones fundamentales estén confirmadas.
