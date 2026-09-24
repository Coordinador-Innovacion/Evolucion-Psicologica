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
Flujo vigente DC-007 (A1): **B solicita → A autoriza/rechaza**.

- `initiate_transfer(caso, origen, nivel?, grado?, sección?)` por B (destino) → `pending` sin efecto en A.
- `authorize_transfer(id)` por A (origen) → cierra período A, crea período B, transfiere responsabilidad, `approved`.
- `reject_transfer(id, motivo?)` por A → `rejected` sin efectos.
- Solo `pending` es activa (índice único). Nivel/grado destino NOT NULL al autorizar.
- No reescribir registros históricos para cambiar su institución de origen. Caso abierto continúa mediante nuevas acciones. Origen solo consulta; destino gestiona nuevas acciones.

Migración 048; reemplaza flujo 019 (`accept_transfer` eliminado).

## Licencia
El cliente nunca decide si la licencia está activa. Cada operación protegida consulta estado server-side. Global tiene bypass total.

DC-009 (A3): aviso UI pequeño (días restantes / vencida = bloqueo nuevas atenciones); NO cierra sesión ni cambia roles (DC-003/005).

## Promoción
DC-010 (A4): flujo **PREPARAR → REVISAR → EJECUTAR**.

- `prepare_promotion` crea lote `PREPARED` con preview en `counts`; NO muta datos.
- `execute_promotion` solo ejecuta `PREPARED|RUNNING|FAILED|INTERRUPTED` (auto-prepara si no hay lote).
- Preview y confirmación antes de ejecutar. Lote único por contexto completado. Si existe lote recuperable, continuar. Cada alumno procesado de forma idempotente. Excepciones explícitas y auditadas.

DC-011 (A5): promoción siempre manual; `map_grade` 6.º Prim→1.º Sec; 5.º Sec→egreso.

## Bootstrap Global
DC-008 (A2): `claim_first_global()` one-shot; sin contraseña fija; se autodesactiva al primer Global.

## Seguridad T65/T66
- B1: authz en SECURITY DEFINER (`get_student_periods`, duplicados, familiares, encuestas).
- B2: triggers máquina de estados (transferencias, casos, ventana 30 min atención).
- B3: `necesidades_especiales` SELECT/MANAGE solo Global/Psicólogo.
- B4: `delete_institution` bloquea si ANY histórico de períodos.
- B5: cerrar/documentar período seed 2026 antes de T64 si EXCLUDE lo exige.
- B6: evidenciar pgcrypto/pg_trgm; B7: no restaurar 016–018.

## Entregable por módulo
Migración, tipos, RLS, funciones, componentes, tests y criterios de aceptación.

Si aparece una contradicción real de negocio, detener ese punto y elevarla; no inventar una regla.
