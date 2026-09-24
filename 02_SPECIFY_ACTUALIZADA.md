# 2. SPECIFY — ACTUALIZADA

## Identidad y períodos
Estudiante: nombres, apellidos, documento, fecha de nacimiento; datos opcionales de nacimiento/domicilio/contacto. No tiene colegioId directo. La pertenencia institucional se determina por PeriodoEscolar.

PeriodoEscolar: estudiante, I.E., año, nivel, grado, sección, inicio, fin, tipo y motivo de retiro. Sin solapamientos. Cambio de sección cierra y abre período. Retiro cierra. Retorno abre nuevo período.

Niveles configurables. Inicialmente Primaria y Secundaria. Grados fijos: Primaria Primero-Sexto; Secundaria Primero-Quinto.

## Familia
Padre y madre fijos al registrar. Un guardián/tutor operativo, reasignable, con relación explícita. Los datos permanentes y el contexto anual se mantienen según las reglas generales del sistema.

## Encuestas institucionales

### Concepto
La evaluación diagnóstica anual anterior queda eliminada y es reemplazada por una encuesta institucional general.

Cada I.E. puede crear sus propias encuestas:
- desde cero;
- copiando una encuesta existente.

Copiar una encuesta crea una nueva encuesta completamente independiente. Cambios posteriores en la copia no afectan a la original.

Una encuesta puede reutilizarse durante distintos años y puede tener varias aplicaciones independientes.

### Versiones
La versión pertenece a una misma encuesta.

- Una versión utilizada conserva su histórico y no se modifica.
- Si la misma encuesta cambia estructuralmente o en su contenido y se requiere una nueva definición, se crea una nueva versión.
- Crear una nueva aplicación NO crea una nueva versión.
- Una segunda aplicación de la misma versión sigue siendo la misma versión.

Ejemplo: Encuesta A V1 → aplicación marzo 2026 → aplicación agosto 2026 → aplicación 2027. Si la encuesta cambia para 2028 → Encuesta A V2.

### Roles de gestión
Pueden crear, editar, publicar y gestionar encuestas:
- Administrador Global
- Director
- Administrador I.E.
- Coordinador
- Psicólogo

El Docente no crea, edita ni publica encuestas.

### Respondientes
En V0 pueden responder:
- Estudiante
- Docente

### Aplicación
Cada vez que se desea realizar una aplicación se crea una nueva aplicación independiente.

Una aplicación contiene como mínimo:
- encuesta/version aplicada;
- año escolar/contexto;
- respondiente;
- fecha/hora de inicio;
- fecha/hora de fin;
- estado;
- avance y/o respuestas;
- timestamps.

No existe una regla que obligue a una sola aplicación por persona/año. Puede haber otra aplicación en el mismo año cuando exista una necesidad.

### Acceso por enlace
La persona accede mediante un enlace de aplicación.

El respondiente ingresa su DNI. El sistema valida su identidad y carga los datos registrados.

El frontend no es la autoridad de seguridad: la validación real se realiza en servidor.

No se crea una tabla por cada enlace temporal. Se recomienda un token seguro firmado y validado server-side, con la ventana temporal de la aplicación.

### Estudiante no registrado
Si el estudiante no existe todavía:
- debe ser registrado previamente por el Psicólogo;
- el Psicólogo puede completar todos los datos disponibles, pero hacerlo completamente es opcional;
- son obligatorios solamente los datos básicos mínimos necesarios para permitir el acceso del estudiante;
- una vez creado ese registro mínimo, el estudiante puede ingresar;
- dentro de la encuesta puede completar los datos adicionales requeridos, incluyendo información de padre/apoderado y otros datos que correspondan.

El Docente no realiza el registro administrativo inicial del estudiante.

### Ventana temporal
La aplicación tiene:
- fecha/hora desde;
- fecha/hora hasta.

Antes del inicio: no disponible. Dentro de la ventana: disponible. Después del fin: vencida/cerrada según estado funcional.

Si se necesita más tiempo, un rol autorizado puede ampliar la fecha/hora de fin de la misma aplicación. El avance guardado se conserva.

Si se desea realizar otra aplicación, se crea otra aplicación independiente.

### Experiencia de respuesta
La encuesta es una experiencia web propia, responsive y optimizada para móvil. No es un formulario gigante.

Debe soportar:
- secciones;
- progreso;
- preguntas individuales o grupos pequeños;
- componentes adecuados al tipo de pregunta;
- visualización profesional;
- navegación anterior/continuar;
- autosave;
- recuperación;
- preview para quienes construyen la encuesta;
- modo edición para roles autorizados;
- modo encuesta para respondientes.

### Preguntas y presentación
Tipos iniciales:
1. texto corto
2. texto largo
3. opción única
4. selección múltiple
5. sí/no
6. número
7. fecha
8. escala
9. selección desde opciones

La configuración de pregunta y presentación se almacena como datos estructurados. Los componentes visuales son código del frontend.

No se almacena HTML/React de la institución y no existe un editor HTML libre.

Una misma pregunta puede utilizar presentaciones controladas compatibles con su tipo, por ejemplo normal o visual/iconográfica.

## Necesidad especial
Una entidad única por estudiante, no un Caso. Una misma condición tiene proyección clínica para Psicólogo y orientación informativa para Docente.

## Roles
Un solo rol institucional activo por persona: Global, Director, Administrador I.E., Coordinador, Docente, Psicólogo.

## Derivaciones
DerivacionRecibida conserva estudiante, fecha, período por fecha del evento, derivador, cargo congelado, registrador, motivo, resumen, acciones previas, adjunto opcional y Caso vinculado opcional. Puede no crear Caso. Un Caso puede existir sin derivación. Una derivación vinculada no crea un segundo Caso. Una derivación puede enlazarse después como antecedente sin reescribirse.

## Caso
Datos: estudiante, situación, derivación opcional, estado, apertura/cierre, motivo de cierre, responsable actual e historial de responsables.

Estados: Inicio, En proceso, Cerrado. Creación = Inicio. Primera Atención = En proceso. Cierre por Psicólogo autorizado. Reapertura confirmada: Cerrado → Inicio; primera nueva Atención → En proceso. Reapertura exige motivo y usuario.

## Atención
Pertenece a Caso, es histórica y no se elimina físicamente. Editable durante 30 minutos desde registro usando hora del servidor; después queda bloqueada. Cambios dentro de ventana se auditan.

## Transferencia
B solicita, A autoriza o rechaza, B recibe historia y asume responsabilidad operativa. A pierde gestión operativa y conserva consulta equivalente a Coordinador.

La solicitud de B queda `pending` sin efecto inmediato en A. Solo A (origen) autoriza (efectos completos) o rechaza (sin efectos). Nivel/grado/sección destino se fijan al solicitar.

Todo lo existente antes del instante de transferencia queda histórico e inmutable para B. Un Caso abierto continúa en B mediante nuevas Atenciones y acciones posteriores.

## Licencias
Global registra por I.E. una licencia con uno o varios códigos/serie, fecha de inicio y fecha fin. A 30 días del vencimiento se alerta al Global. Renovación = nuevo registro. Estado derivado por fechas.

## Promoción masiva
Wizard con I.E./ámbito, origen prefijado al año anterior, destino prefijado al año actual y previsualización. Origen/destino son visibles y editables antes de ejecutar.

Flujo: PREPARAR (lote `PREPARED` sin mutar datos) → REVISAR (preview/counts) → EJECUTAR (solo lotes preparados/reanudables). Promoción siempre manual.

Se conserva la idempotencia, reanudación y manejo explícito de excepciones.

## Auditoría y analítica
Auditoría = quién hizo qué y cuándo. Analítica = uso operativo. No se mezclan. No usar contenido clínico como fuente de analítica.
