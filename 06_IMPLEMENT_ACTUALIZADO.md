# 6. IMPLEMENT — ACTUALIZADO

Implementar únicamente lo definido en Constitution, Specify, Clarify, Plan y Tasks actualizados.

## Precedencia
Las decisiones más recientes de este paquete reemplazan definiciones históricas incompatibles.

## Prohibiciones
No cambiar reglas silenciosamente; no crear roles adicionales; no múltiples roles activos; no contraseñas propias; no permisos solo por UI; no duplicar historia sin necesidad; no promoción sin idempotencia; no continuidad automática entre niveles sin regla; no eliminación física de historia clínica.

No implementar `diagnosticos_anuales` como módulo funcional.

No trasladar la antigua ficha diagnóstica de 11 bloques como encuesta predeterminada del sistema.

## Método por módulo
1. Datos.
2. Constraints.
3. RLS/seguridad.
4. Operación server-side.
5. Auditoría.
6. UI.
7. Tests.
8. Revisión.

## Encuestas
Implementar el motor general institucional.

La encuesta se construye por datos estructurados: encuesta → versión → secciones → preguntas → opciones.

El frontend renderiza los componentes según tipo/presentación.

Una copia de encuesta es independiente.

Una versión utilizada queda inmutable.

Cada aplicación es independiente y registra su ventana de fecha/hora.

El enlace se genera/valida de forma segura server-side. El DNI identifica al respondiente y permite cargar sus datos.

Si el estudiante no existe, solo el Psicólogo puede realizar el registro administrativo inicial. Los datos básicos mínimos son obligatorios; completar todos los demás datos por el Psicólogo es opcional.

El estudiante puede completar posteriormente los datos adicionales dentro de la encuesta.

Si una aplicación vence, un rol autorizado puede ampliar su fecha/hora de fin. No se crea una segunda aplicación para ampliar el tiempo.

Una nueva aplicación representa una aplicación realmente nueva.

## Transferencia
No reescribir registros históricos para cambiar su institución de origen. Caso abierto continúa mediante nuevas acciones. La institución origen queda en consulta.

## Licencia
El cliente nunca decide si la licencia está activa. Cada operación protegida consulta estado server-side. Global tiene bypass total.

## Promoción
Preview y confirmación antes de ejecutar. Lote único por contexto completado. Si existe lote recuperable, continuar. Cada alumno procesado de forma idempotente. Excepciones explícitas y auditadas.

## Entregable por módulo
Migración, tipos, RLS, funciones, componentes, tests y criterios de aceptación.

Si aparece una contradicción real de negocio, detener ese punto y elevarla; no inventar una regla.
