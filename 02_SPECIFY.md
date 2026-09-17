# 2. SPECIFY

## Identidad y períodos
Estudiante: nombres, apellidos, documento, fecha de nacimiento; datos opcionales de nacimiento/domicilio/contacto. No tiene colegioId directo. La pertenencia institucional se determina por PeriodoEscolar.

PeriodoEscolar: estudiante, I.E., año, nivel, grado, sección, inicio, fin, tipo y motivo de retiro. Sin solapamientos. Cambio de sección cierra y abre período. Retiro cierra. Retorno abre nuevo período.

Niveles configurables. Inicialmente Primaria y Secundaria. Grados fijos: Primaria Primero-Sexto; Secundaria Primero-Quinto.

## Familia
Padre y madre fijos al registrar. Un guardián/tutor operativo, reasignable, con relación explícita. Datos permanentes en Familiar; contexto anual en DiagnósticoAnual.

## Diagnóstico anual
Uno por estudiante/año. No depende de una I.E. concreta y no se duplica por cambio de institución.

### Captura
**Decisión técnica:** pequeña página web responsive propia del sistema, optimizada para móvil, en lugar de Google Forms/Microsoft Forms u otro proveedor externo.

Razones: identidad y seguridad bajo control del sistema, guardado directo en Supabase, autosave, recuperación, versionado y ausencia de procesos de importación/reconciliación.

Flujo: acceso seguro del estudiante → bloques/preguntas → autosave → recuperación si se interrumpe → envío/finalización.

### Modelo
El formulario se define por schema JSON versionado y sus respuestas se almacenan en JSONB. No se crea una columna por pregunta.

Ejemplo conceptual:
```json
{
  "formVersion": "2026.1",
  "blocks": [
    {
      "key": "aspecto_academico",
      "title": "VII. ASPECTO ACADÉMICO",
      "questions": [
        {"key":"q_7_1","type":"single_choice","required":false,"options":[{"value":"si","label":"Sí"},{"value":"no","label":"No"}]}
      ]
    }
  ]
}
```

Tipos base: single_choice, multi_choice, text, long_text, number, date, boolean, select.

Tabla `diagnosticos_anuales`: student_id, school_year, form_version, responses JSONB, technical_status, timestamps y contexto de creación. Unicidad estudiante/año. El año se obtiene del contexto escolar al iniciar.

Se precarga el año anterior copiando contenido a un nuevo registro editable; no se enlaza como versión clínica. Campos incompletos no bloquean guardado.

La ficha histórica proporcionada contiene 11 bloques: I Datos Generales; II Aspecto Familia; III Aspecto Laboral y Económico; IV Aspecto Vivienda; V Aspecto de Salud; VI Aspecto de Alimentación; VII Aspecto Académico; VIII Aspecto Emocional; IX Aspecto Social; X Aspecto Personal; XI Tus Habilidades. La fuente contiene preguntas concretas y opciones que deben trasladarse al schema sin alterar su sentido. fileciteturn34file4L304-L345 fileciteturn34file0L23-L66 fileciteturn34file2L192-L216

Hay preguntas sensibles en la fuente; por ello las respuestas completas no se entregan a roles sin autorización clínica.

Acceso: Psicólogo y Global pueden consultar contenido clínico completo según contexto; Coordinador recibe proyección institucional permitida; Director/Administrador I.E./Docente no reciben el diagnóstico clínico completo.

## Necesidad especial
Una entidad única por estudiante, no un Caso. Una misma condición tiene proyección clínica para Psicólogo y orientación informativa para Docente. Campos mínimos: student_id, condition_type, clinical_description, teacher_orientation, certifying_entity, certification_date, document_id, timestamps. No se agrega una lógica propia de vigencia/estado clínico.

## Roles
Un solo rol institucional activo por persona: Global, Director, Administrador I.E., Coordinador, Docente, Psicólogo.

## Derivaciones
DerivacionRecibida conserva estudiante, fecha, período por fecha del evento, derivador, cargo congelado, registrador, motivo, resumen, acciones previas, adjunto opcional y Caso vinculado opcional. Puede no crear Caso. Un Caso puede existir sin derivación. Una derivación vinculada no crea un segundo Caso. Una derivación puede enlazarse después como antecedente sin reescribirse.

## Caso
Datos: estudiante, situación, derivación opcional, estado, apertura/cierre, motivo de cierre, responsable actual e historial de responsables.

Estados: Inicio, En proceso, Cerrado. Creación = Inicio. Primera Atención = En proceso. Cierre por Psicólogo autorizado. Reapertura confirmada: Cerrado → Inicio; la primera nueva Atención cambia a En proceso. Reapertura exige motivo y usuario. Caso cerrado + misma situación crea nuevo Caso por defecto; el Psicólogo puede reabrir el anterior justificándolo.

Los Casos pueden continuar entre I.E. y pueden existir varios abiertos cuando representan situaciones distintas.

## Atención
Pertenece a Caso, es histórica y no se elimina físicamente. Editable durante 30 minutos desde registro usando hora del servidor; después queda bloqueada. Cambios dentro de ventana se auditan. Campos funcionales: fecha, motivo, qué se hizo/observaciones, compromisos/recomendaciones, próxima atención sugerida y origen opcional.

La línea de tiempo indica posición/historia, no porcentaje de progreso.

## Transferencia
B solicita, A autoriza, B recibe historia y asume responsabilidad operativa. A pierde gestión operativa y conserva consulta equivalente a Coordinador.

**Frontera exacta:** todo lo existente antes del instante de transferencia queda histórico e inmutable para B: períodos, diagnósticos anuales, derivaciones, atenciones, documentos, hechos históricos del Caso y auditoría. Un Caso abierto sí continúa en B mediante nuevas Atenciones, cambios de responsable, cierre y reapertura autorizada. Las acciones posteriores no modifican registros históricos anteriores.

La transferencia es transaccional y auditable. No requiere duplicar físicamente toda la historia.

## Licencias
Global registra por I.E. una licencia con uno o varios códigos/serie, fecha de inicio y fecha fin. A 30 días del vencimiento se alerta al Global. Renovación = nuevo registro con nuevos códigos/fechas; la licencia anterior permanece histórica.

Estado derivado por fechas. Vencida = acceso equivalente a Coordinador para usuarios de la I.E. Global conserva acceso total. El servidor verifica licencia actual incluso con sesión abierta. No permitir licencias superpuestas para la misma I.E. Un código no se reutiliza.

Credenciales mediante Supabase Auth. El primer Global se provisiona controladamente; el sistema comunica la identidad asignada y obliga a cambiar contraseña en el primer acceso. No se muestran credenciales administrativas en la interfaz pública.

## Promoción masiva
Wizard con I.E./ámbito, origen prefijado al año anterior, destino prefijado al año actual y previsualización. Origen/destino son visibles y editables antes de ejecutar.

Grado se mapea automáticamente según catálogo fijo. Último grado produce resultado Egreso; no se crea automáticamente continuidad a otro nivel sin regla configurada. Se conserva sección cuando corresponde. Retirados se excluyen. Repetidores se manejan como excepción manual posterior.

La ejecución crea lote y acciones por estudiante. Antes de ejecutar se verifica lote previo equivalente, interrupciones y períodos existentes. No se duplica un período destino. Si el lote fue interrumpido, se reanuda solo lo pendiente.

Estados lote: PREPARED, RUNNING, COMPLETED, COMPLETED_WITH_EXCEPTIONS, INTERRUPTED, FAILED.

Excepción: resultado automático, resultado final, motivo, usuario, fecha; acción “Editar excepción”. Todo auditado.

## Auditoría y analítica
Auditoría = quién hizo qué y cuándo. Analítica = uso operativo. No se mezclan. No usar contenido clínico como fuente de analítica.
