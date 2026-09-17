# 6. IMPLEMENT

Implementar únicamente lo definido en Constitution, Specify, Clarify, Plan y Tasks.

## Precedencia
Las decisiones más recientes de este paquete reemplazan definiciones históricas incompatibles.

## Prohibiciones
No cambiar reglas silenciosamente; no crear roles adicionales; no múltiples roles activos; no diagnóstico como columnas por pregunta; no contraseñas propias; no permisos solo por UI; no duplicar historia sin necesidad; no promoción sin idempotencia; no continuidad automática entre niveles sin regla; no eliminación física de historia clínica.

## Método por módulo
1. Datos.
2. Constraints.
3. RLS/seguridad.
4. Operación server-side.
5. Auditoría.
6. UI.
7. Tests.
8. Revisión.

## Diagnóstico
Renderer basado en schema JSON versionado. Respuestas JSONB. Captura responsive propia. Autosave/recuperación. No alterar el sentido de las preguntas de la fuente.

## Transferencia
No reescribir registros históricos para cambiar su institución de origen. Caso abierto continúa mediante nuevas acciones. La institución origen queda en consulta.

## Licencia
El cliente nunca decide si la licencia está activa. Cada operación protegida consulta estado server-side. Global tiene bypass total.

## Promoción
Preview y confirmación antes de ejecutar. Lote único por contexto completado. Si existe lote recuperable, continuar. Cada alumno procesado de forma idempotente. Excepciones explícitas y auditadas.

## Entregable por módulo
Migración, tipos, RLS, funciones, componentes, tests y criterios de aceptación.

Si aparece una contradicción real de negocio, detener ese punto y elevarla; no inventar una regla.
