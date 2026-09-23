# 7. CONVERGE — ACTUALIZADO

## Revisión final

### Identidad
Estudiante único; períodos sin solapamiento; contexto histórico preservado.

### Roles
Un rol activo; permisos server-side; ausencia de acceso clínico indebido.

### Encuestas
La evaluación diagnóstica anual anterior no existe como módulo funcional.

Verificar:
- encuesta independiente por I.E.;
- creación desde cero;
- copia independiente;
- versiones de una misma encuesta;
- inmutabilidad de versión utilizada;
- aplicaciones independientes;
- repetición en años posteriores;
- posibilidad de múltiples aplicaciones en un mismo año;
- fecha/hora de inicio y fin;
- ampliación de plazo sin crear otra aplicación;
- acceso mediante enlace seguro;
- identificación por DNI;
- carga de datos registrados;
- registro previo obligatorio por Psicólogo si el estudiante no existe;
- datos básicos mínimos obligatorios;
- datos adicionales completables dentro de la encuesta;
- Docente no puede gestionar encuestas;
- componentes visuales renderizados por frontend;
- sin HTML/React almacenado en DB;
- autosave y recuperación;
- respuestas asociadas a la aplicación correcta.

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
Códigos; inicio/fin; alerta 30 días; renovación como nuevo registro; vencida = NO cambia roles, solo bloquea nuevas atenciones psicológicas (DC-003); Global = acceso total; sesión activa no evade vencimiento.

### Promoción
Origen/destino visibles; prefill; preview; mapeo automático; último grado = Egreso; retirados excluidos; repetidores por excepción; lote idempotente; reanudación; doble ejecución bloqueada; excepciones auditadas; sin duplicados ni solapamientos.

### Seguridad
Probar allow/deny por rol, institución, encuestas, aplicaciones, enlaces, DNI, estudiante no registrado y datos sensibles.

### Concurrencia
Probar:
- dos accesos simultáneos a una aplicación;
- autosave concurrente;
- vencimiento durante una operación;
- ampliación de plazo durante una sesión;
- creación de dos aplicaciones independientes;
- doble promoción;
- doble transferencia;
- cambios de responsable concurrentes;
- edición cerca del minuto 30.

## Criterio final
Solo declarar **PROYECTO LISTO PARA DESARROLLO** cuando no existan huecos críticos conocidos, las decisiones fundamentales estén confirmadas y la implementación haya convergido con esta especificación.
