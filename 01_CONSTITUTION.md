# 1. CONSTITUTION

1. La información pertenece al estudiante y conserva el contexto de ocurrencia.
2. La historia no se reescribe para acomodarla al presente.
3. Institución actual y contexto histórico son conceptos distintos.
4. Seguridad por rol, institución, operación y sensibilidad.
5. Las reglas críticas se validan en servidor, no solo en UI.
6. Operaciones masivas idempotentes y reanudables.
7. Acciones sensibles auditables.
8. No eliminar físicamente historia clínica/histórica.
9. Calidad de información > cantidad de controles.
10. Arquitectura mínima coherente; no agregar complejidad sin beneficio.

## Precedencia
Decisiones recientes confirmadas > arquitectura actual > documentación histórica compatible > documentación reemplazada.

## Seguridad
Supabase Auth gestiona credenciales. RLS protege acceso. Claves privilegiadas nunca llegan al navegador. Diagnóstico y datos clínicos son sensibles.

## UX
VER → UBICAR → COMPRENDER → ACTUAR.
