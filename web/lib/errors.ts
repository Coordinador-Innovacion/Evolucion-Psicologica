const PG_CODE_MAP: Record<string, string> = {
  "23505": "Ya existe un registro con estos datos únicos.",
  "23503": "No se encontró un registro relacionado.",
  "23514": "Los datos no cumplen una regla de validación.",
  "23502": "Faltan datos obligatorios.",
  "42501": "No tiene permisos para realizar esta acción.",
  "42P01": "Recurso no encontrado.",
  "PGRST116": "No se encontró el registro solicitado.",
  "PGRST301": "La sesión ha expirado. Inicie sesión nuevamente.",
  "PGRST202": "La operación no está permitida.",
};

const HTTP_CODE_MAP: Record<number, string> = {
  400: "Solicitud inválida. Revise los datos ingresados.",
  401: "Debe iniciar sesión para continuar.",
  403: "No tiene permisos para realizar esta acción.",
  404: "Recurso no encontrado.",
  413: "El archivo es demasiado grande.",
  415: "Tipo de archivo no soportado.",
  429: "Demasiadas solicitudes. Intente de nuevo en unos minutos.",
  500: "Error del servidor. Intente de nuevo.",
  502: "Servicio no disponible. Intente de nuevo.",
  503: "Servicio no disponible. Intente de nuevo.",
};

const TECHNICAL_RE =
  /duplicate key|violates|row-level security|permission denied|invalid input syntax|not authorized|JWT|fetch failed|Failed to fetch|NetworkError|syntax error at|column .* does not exist|relation .* does not exist|PGRST\d+|failed to fetch|load failed/i;

interface ErrorLike {
  code?: string | number;
  message?: string;
  msg?: string;
  status?: string | number;
}

function isTechnical(message: string): boolean {
  return TECHNICAL_RE.test(message);
}

/**
 * Traduce un error técnico (PostgREST/Postgres/red) a un mensaje amigable.
 * Preserva mensajes ya pensados para el usuario (no técnicos).
 */
export function toUserMessage(error: unknown, fallback: string): string {
  if (error === null || error === undefined) return fallback;

  const err = error as ErrorLike;

  const code = err.code;
  if (typeof code === "string" && PG_CODE_MAP[code]) {
    return PG_CODE_MAP[code];
  }
  if (typeof code === "number" && HTTP_CODE_MAP[code]) {
    return HTTP_CODE_MAP[code];
  }

  const status = err.status;
  if (typeof status === "number" && HTTP_CODE_MAP[status]) {
    return HTTP_CODE_MAP[status];
  }
  if (typeof status === "string") {
    const n = Number(status);
    if (Number.isFinite(n) && HTTP_CODE_MAP[n]) return HTTP_CODE_MAP[n];
  }

  const message =
    typeof err.message === "string"
      ? err.message
      : typeof err.msg === "string"
        ? err.msg
        : null;

  if (message && message.trim().length > 0) {
    if (isTechnical(message)) return fallback;
    if (message.length > 300 || message.includes("\n")) return fallback;
    return message;
  }

  return fallback;
}

/**
 * Log de errores de cliente sin contenido clínico ni datos sensibles.
 */
export function logClientError(context: string, error: unknown): void {
  const err = error as ErrorLike;
  const message =
    typeof err?.message === "string"
      ? err.message.slice(0, 200)
      : typeof err?.msg === "string"
        ? err.msg.slice(0, 200)
        : typeof error === "string"
          ? error.slice(0, 200)
          : "unknown";

  console.error("[client-error]", context, {
    code: typeof err?.code === "string" || typeof err?.code === "number" ? err.code : undefined,
    message,
    ts: new Date().toISOString(),
  });
}
