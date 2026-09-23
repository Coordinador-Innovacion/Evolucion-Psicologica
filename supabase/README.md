# Configuración de Supabase - Evolución Psicológica

## Estructura del Proyecto

```
supabase/
├── config.toml           # Configuración de Supabase CLI
├── .env.example          # Variables de entorno de ejemplo
├── seed.sql              # Datos iniciales de prueba
└── migrations/           # Migraciones de base de datos
    ├── 001_extensions_and_functions.sql
    ├── 002_catalog_tables.sql
    ├── 003_students_and_periods.sql
    ├── 004_family_members.sql
    ├── 005_annual_diagnostic.sql
    ├── 006_special_needs.sql
    ├── 007_referrals_and_cases.sql
    ├── 008_attentions.sql
    ├── 009_transfers.sql
    ├── 010_licenses.sql
    ├── 011_promotion.sql
    ├── 012_audit.sql
    ├── 013_documents.sql
    ├── 014_rls_policies.sql
    ├── 015_user_profiles.sql
    ├── 016_*.sql ... 019_*.sql
    ├── 020_*.sql ... 024_*.sql
    ├── 025_survey_definitions.sql
    ├── 026_survey_applications.sql
    ├── 027_survey_constraints.sql
    ├── 028_survey_rls.sql
    ├── 029_survey_functions.sql
    └── 030_survey_cleanup.sql
```

## Tablas Principales

| Tabla | Descripción |
|-------|-------------|
| `institutions` | Instituciones educativas |
| `niveles_educativos` | Niveles (Primaria, Secundaria) |
| `grados` | Grados por nivel |
| `estudiantes` | Datos de estudiantes |
| `periodos_escolares` | Períodos académicos por estudiante |
| `familiares` | Padres, madres y tutores |
| `encuestas` | Encuestas institucionales |
| `encuesta_versiones` | Versiones de encuestas |
| `encuesta_secciones` | Secciones de una versión |
| `encuesta_preguntas` | Preguntas de una sección |
| `encuesta_opciones` | Opciones de preguntas de selección |
| `encuesta_aplicaciones` | Instancias de aplicación con ventana temporal |
| `encuesta_respuestas` | Respuestas por aplicación/pregunta |
| `necesidades_especiales` | Condiciones especiales |
| `derivaciones` | Derivaciones de estudiantes |
| `casos` | Casos de acompañamiento |
| `atenciones` | Atenciones psicológicas |
| `transferencias` | Transferencias entre instituciones |
| `licencias` | Licencias del sistema |
| `lotes_promocion` | Lotes de promoción estudiantil |
| `perfiles` | Perfiles de usuario |

## Seguridad (RLS)

Todas las tablas tienen habilitado Row Level Security (RLS). Las políticas definen:

- **Global**: Acceso total a todo el sistema
- **Director**: Gestión de su institución
- **Administrador I.E.**: Gestión administrativa de su institución
- **Coordinador**: Gestión operativa de su institución
- **Docente**: Consulta de información informativa
- **Psicólogo**: Acceso a información clínica y gestión de encuestas

## Configuración Local

### Requisitos Previos

1. [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y ejecutándose
2. [Supabase CLI](https://supabase.com/docs/guides/cli) instalado

### Pasos para Configurar

1. Clonar el repositorio
2. Copiar `supabase/.env.example` a `supabase/.env`
3. Ejecutar `supabase init` en la raíz del proyecto
4. Ejecutar `supabase start` para iniciar Supabase local
5. Ejecutar `supabase db reset` para aplicar migraciones y seed data

### Comandos Útiles

```bash
# Iniciar Supabase local
supabase start

# Resetear base de datos
supabase db reset

# Aplicar migraciones
supabase db push

# Generar tipos de TypeScript
supabase gen types typescript --local > types/supabase.ts

# Abrir Studio (interfaz web)
supabase studio
```

## Variables de Entorno

### Para Next.js (web/)

```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Para Expo (mobile/)

```env
EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Notas Importantes

1. **Encuestas institucionales**: Acceso por enlace seguro y DNI; gestión por roles autorizados (Global, Director, Admin IE, Coordinador, Psicólogo)
2. **Información Clínica**: No se muestra a roles sin autorización
3. **Transferencias**: Requieren autorización de Global
4. **Licencias**: Solo Global puede gestionar
5. **Auditoría**: Todos los cambios sensibles quedan registrados
