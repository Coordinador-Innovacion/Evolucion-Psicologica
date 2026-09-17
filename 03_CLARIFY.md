# 3. CLARIFY

## Resoluciones críticas
- Diagnóstico: formulario web propio + schema JSON versionado + respuestas JSONB.
- El diagnóstico es anual y único por estudiante/año.
- Transferencia: historial anterior congelado; Caso abierto continúa operativamente en destino.
- Reapertura: Cerrado → Inicio → primera Atención → En proceso.
- Licencia: comportamiento calculado por fechas; vencida equivale a consulta de Coordinador; Global siempre conserva acceso total.
- Renovación de licencia: nuevo registro, nunca sobrescribir el anterior.
- Promoción: origen/destino explícitos, preview, mapeo automático, último grado = Egreso, excepciones, idempotencia y reanudación.

## Huecos cerrados técnicamente
- No columnas por pregunta del diagnóstico.
- No contraseñas propias.
- No decisiones de permisos basadas solo en UI.
- No duplicación física de historia en transferencia salvo necesidad técnica futura.
- No promoción masiva ciega.
- No matrícula automática de otro nivel por simple suma del grado.
