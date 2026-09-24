# 00 — DECISIONES CONFIRMADAS

## Propósito

Registro transversal de decisiones de negocio confirmadas durante la evolución del proyecto.

No reemplaza los ocho documentos oficiales de la Ruta Maestra. Registra decisiones posteriores que modifican, reemplazan, aclaran o invalidan definiciones anteriores.

Cuando exista contradicción entre una definición histórica y una decisión posterior registrada aquí, prevalece la decisión confirmada vigente.

## Regla operativa para MiMo

Antes de implementar cualquier tarea, MiMo debe consultar:

1. Los 8 documentos oficiales de la Ruta Maestra.
2. Este `00_DECISIONES_CONFIRMADAS.md`.
3. El estado actual del repositorio y de la implementación.

Debe entonces:

1. Detectar decisiones posteriores sobre el mismo tema.
2. Determinar cuál está vigente.
3. Identificar qué regla anterior reemplaza.
4. No revivir reglas supersedidas.
5. No inventar reconciliaciones ante contradicciones reales.
6. Aplicar la decisión vigente.
7. Si hace falta una nueva decisión de negocio, detenerse y solicitarla.
8. Identificar documentos/etapas afectados.
9. Mantener trazabilidad: decisión → documentación → tarea → implementación → prueba → CONVERGE.

### Precedencia

La decisión más reciente marcada `VIGENTE` sobre un mismo asunto prevalece sobre decisiones anteriores y definiciones históricas incompatibles.

Una nueva decisión que reemplace otra debe indicar explícitamente qué decisión reemplaza.

## Estados

- `VIGENTE`
- `SUPERSEDIDA`
- `ACLARADA`
- `CANCELADA`

---

# REGISTRO DE DECISIONES

## DC-001 — Eliminación de la Evaluación Diagnóstica

**Tema:** Evaluación diagnóstica / diagnóstico anual.

**Decisión vigente:** La evaluación diagnóstica anual anterior queda eliminada del sistema y es reemplazada por el Motor General de Encuestas Institucionales.

**Reemplaza:** Las reglas, tareas y estructuras del antiguo módulo de diagnóstico/evaluación anual.

**Estado:** VIGENTE.

**Impacto:** SPECIFY, CLARIFY, PLAN, TASKS, IMPLEMENT y CONVERGE.

---

## DC-002 — Motor General de Encuestas Institucionales

**Tema:** Encuestas institucionales.

**Decisión vigente:**

- Cada Institución Educativa crea y administra sus propias encuestas.
- Una encuesta puede crearse desde cero.
- Puede copiarse desde otra encuesta.
- La copia es completamente independiente de la original.
- Una institución puede conservar múltiples encuestas y reutilizarlas.
- Copiar una encuesta NO crea una versión de la original.
- La versionación pertenece únicamente a la evolución de una misma encuesta.
- Una versión utilizada queda inmutable.
- Una nueva aplicación no crea una nueva versión.
- Las aplicaciones son registros independientes.
- Extender una aplicación mantiene la misma aplicación y su progreso.
- La interfaz debe ser moderna, responsive, por secciones, con progreso, recuperación/autoguardado, navegación y componentes visuales apropiados.
- Los componentes visuales son código frontend; no se almacena HTML/React arbitrario en la base de datos.

**Estado:** VIGENTE.

---

## DC-003 — Licencia vencida

**Tema:** Comportamiento del sistema cuando vence la licencia de una institución.

**Decisión vigente:**

- NO se modifican los roles.
- NO se convierte a los usuarios en Coordinadores.
- Todos los usuarios pueden continuar accediendo al sistema.
- Las sesiones activas no se invalidan automáticamente.
- La única restricción confirmada es impedir que el Psicólogo genere/registre nuevas atenciones psicológicas.
- Las demás funciones continúan disponibles según sus permisos normales.
- La restricción debe aplicarse del lado servidor.
- El vencimiento no debe bloquear operaciones históricas permitidas ni la edición de atenciones existentes que siga permitida por sus reglas propias.

**Reemplaza:** Cualquier definición anterior que cambiara roles o bloqueara globalmente el acceso por vencimiento.

**Estado:** VIGENTE.

---

## DC-004 — Alerta interna de licencia

**Tema:** Aviso de vencimiento de licencia.

**Decisión vigente:**

- Alerta interna cuando falten 30 días o menos para vencer.
- Debe indicar cuántos días faltan.
- Con licencia vencida, debe indicar que está vencida y que las nuevas atenciones psicológicas están bloqueadas.
- Inicialmente no se requieren correo, WhatsApp, SMS ni otros canales externos.

**Estado:** VIGENTE.

---

## DC-005 — Persistencia de sesión después del vencimiento

**Tema:** Sesión de usuario y licencia.

**Decisión vigente:** El vencimiento de la licencia NO provoca cierre automático de sesión. El usuario permanece autenticado y puede utilizar las funciones permitidas. La restricción de nuevas atenciones psicológicas se valida en servidor al intentar ejecutar la operación restringida.

**Reemplaza:** Cualquier comportamiento que cierre la sesión por vencimiento.

**Estado:** VIGENTE.

---

## DC-006 — Inicialización del usuario Global

**Tema:** Primer acceso y creación inicial del usuario Global.

**Decisión vigente:**

El sistema debe disponer de un mecanismo de primera inicialización que permita acceder mediante un usuario y contraseña iniciales preestablecidos para el usuario con rol Global.

Reglas confirmadas:

- Corresponde al acceso inicial del sistema.
- La credencial inicial permite el primer acceso/configuración del usuario Global.
- Una vez dentro, el Global puede cambiar/editar sus propias credenciales y los datos administrativos permitidos.
- El Global puede posteriormente administrar los demás usuarios conforme a las reglas de administración de usuarios.
- El mecanismo no debe permitir crear múltiples Global accidentalmente o de forma ilimitada.
- La credencial inicial no debe convertirse en una contraseña permanente obligatoria después de la configuración inicial.
- El mecanismo técnico de bootstrap, protección, almacenamiento y control de ejecución queda a criterio de MiMo, respetando estas reglas.
- No se debe hardcodear una contraseña trivial como mecanismo permanente de seguridad.
- Si esta lógica cambia, la nueva decisión debe reemplazar explícitamente esta decisión en este registro.

**Estado:** VIGENTE.

**Impacto:** autenticación, roles, administración de usuarios, seguridad, bootstrap inicial, PLAN, TASKS, IMPLEMENT y CONVERGE.

---

## DC-007 — Transferencias: B solicita → A autoriza (A1)

**Tema:** Flujo de transferencia de estudiante entre instituciones.

**Decisión vigente:**

- Regla única: **B (destino) solicita → A (origen) autoriza o rechaza**.
- `initiate_transfer` lo llama B (destino; no-global = propia institución) → status `pending`, **sin efecto inmediato en A**.
- `authorize_transfer` lo llama A (origen) → cierra período A, crea período B, transfiere responsabilidad, status `approved`.
- `reject_transfer` lo llama A → status `rejected`, sin efectos.
- Solo `pending` cuenta como transferencia activa (índice único por caso).
- Nivel, grado y sección destino se fijan al solicitar (columnas NOT NULL en períodos).
- El flujo 019 (A inicia con efecto inmediato → B acepta) queda **SUPERSEDIDO**.

**Reemplaza:** Flujo de 016/017/019 (`initiate` por A con efecto inmediato, `accept_transfer`).

**Estado:** VIGENTE.

**Impacto:** SPECIFY, TASKS, IMPLEMENT (048), pruebas T62/RLS8, CONVERGE.

---

## DC-008 — Bootstrap Global one-shot (A2)

**Tema:** Primer usuario Global.

**Decisión vigente:** Mecanismo one-shot `claim_first_global()`: si no existe ningún Global, promueve al usuario autenticado (signup normal con contraseña propia), se autodesactiva. Sin contraseña fija ni puerta trasera. Complementa DC-006 sin hardcodear credenciales permanentes.

**Estado:** VIGENTE.

**Impacto:** auth, roles, bootstrap, IMPLEMENT (049).

---

## DC-009 — Licencia: aviso menor, sin corte de sesión (A3)

**Tema:** Comportamiento de UI ante licencia por vencer/vencida.

**Decisión vigente:** Aviso pequeño superior (días restantes; si vencida, aviso de bloqueo de nuevas atenciones psicológicas). NO cierra sesión, NO cambia roles; bloqueo solo server-side. Ya alineado con DC-003/DC-004/DC-005.

**Estado:** VIGENTE.

**Impacto:** UI licencias, IMPLEMENT.

---

## DC-010 — Promoción PREPARAR → REVISAR → EJECUTAR (A4)

**Tema:** Flujo de promoción masiva.

**Decisión vigente:**

- `prepare_promotion` crea lote `PREPARED` con preview en `counts`, **NO muta** datos definitivos.
- `execute_promotion` solo ejecuta `PREPARED|RUNNING|FAILED|INTERRUPTED` (si no hay lote, auto-prepara vía `prepare_promotion` y ejecuta).
- Flujo de UI: PREPARAR → REVISAR → EJECUTAR.

**Estado:** VIGENTE.

**Impacto:** SPECIFY promoción, TASKS, IMPLEMENT (049), UI wizard.

---

## DC-011 — Promoción manual; mapeo 6.º Prim→1.º Sec; egreso 5.º Sec (A5)

**Tema:** Política de promoción.

**Decisión vigente:**

- Promoción **siempre manual** (sin cron automático).
- 6.º Primaria → 1.º Secundaria vía `map_grade` (ya implementado).
- 5.º Secundaria → egreso (se mantiene; SPECIFY contempla Secundario Primero–Quinto).

**Estado:** VIGENTE.

**Impacto:** SPECIFY promoción, IMPLEMENT, pruebas T64.

---

## DC-012 — T67: Registro docente con I.E. + cierre de bootstrap en app

**Tema:** Registro público, institución y Global inicial.

**Decisión vigente:**

- Registro público **solo crea rol `docente`** (whitelist server-side).
- Paso corto de **código modular** de I.E.: preview (nombre + niveles) → confirmación → datos del docente.
- `institution_id` se resuelve **solo en backend** desde el código; no se confía en el cliente.
- Código inexistente → **no se completa el registro**.
- `claim_first_global()` **se mantiene en DB**; queda **fuera del alcance de la app** (REVOKE anon/authenticated).
- El **primer Global** se crea/gestiona **administrativamente en Supabase Dashboard** (propietario autorizado; vía de emergencia).
- Recuperación de contraseña: **estándar Supabase Auth** (`resetPasswordForEmail` + `updateUser`), sin sistema propio complejo.
- **No eliminar** la cuenta docente existente (se conserva para pruebas).
- Redirect de confirmación usa el **origin de la request** (producción), no localhost.

**Estado:** VIGENTE.

**Impacto:** auth, registro UI, migración 050, IMPLEMENT, TASKS.

---

# PROCEDIMIENTO PARA NUEVAS DECISIONES

Agregar cada nueva decisión con:

## DC-XXX — [Título]

**Tema:** [tema].

**Decisión vigente:**

[Regla confirmada por el usuario.]

**Reemplaza:** [decisión/regla anterior].

**Estado:** VIGENTE.

**Impacto:** [etapas/documentos/tareas afectados].

Cuando una nueva decisión reemplaza una anterior:

1. Registrar la nueva como `VIGENTE`.
2. Pasar la anterior a `SUPERSEDIDA`.
3. Conservar la anterior para trazabilidad.
4. Identificar documentos oficiales afectados.
5. Actualizar únicamente los documentos oficiales afectados.
6. Revisar impacto en PLAN, TASKS, IMPLEMENT y CONVERGE.

# PRINCIPIO DE NO DUPLICACIÓN

Este registro NO sustituye ni replica los ocho documentos oficiales.

Su función es controlar decisiones nuevas, cambios de reglas, reemplazos, aclaraciones, precedencia y trazabilidad.

Los documentos oficiales siguen siendo la definición consolidada de cada etapa.

# CRITERIO DE CONVERGENCIA

Antes de declarar el proyecto listo:

CONSTITUTION → SPECIFY → CLARIFY → PLAN → TASKS → IMPLEMENT → PRUEBAS → CONVERGE

debe ser consistente con todas las decisiones `VIGENTE`.

Ninguna decisión `SUPERSEDIDA` debe gobernar comportamiento nuevo.

Si código, tareas, plan o documentación contradicen una decisión vigente, debe identificarse la desviación y corregirse en el nivel correspondiente antes del cierre.
