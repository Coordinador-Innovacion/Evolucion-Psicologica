import { describe, expect, it, vi, afterEach } from "vitest";
import { toUserMessage, logClientError } from "@/lib/errors";

describe("toUserMessage", () => {
  it("traduce código Postgres 23505 (unicidad)", () => {
    expect(toUserMessage({ code: "23505" }, "fallback")).toBe(
      "Ya existe un registro con estos datos únicos."
    );
  });

  it("traduce código Postgres 23503 (FK)", () => {
    expect(toUserMessage({ code: "23503" }, "fallback")).toBe(
      "No se encontró un registro relacionado."
    );
  });

  it("traduce código Postgres 42501 (RLS/permisos)", () => {
    expect(toUserMessage({ code: "42501" }, "fallback")).toBe(
      "No tiene permisos para realizar esta acción."
    );
  });

  it("traduce código Postgres 23514 (CHECK)", () => {
    expect(toUserMessage({ code: "23514" }, "fallback")).toBe(
      "Los datos no cumplen una regla de validación."
    );
  });

  it("traduce códigos HTTP de red", () => {
    expect(toUserMessage({ code: 401 }, "fallback")).toBe(
      "Debe iniciar sesión para continuar."
    );
    expect(toUserMessage({ status: 500 }, "fallback")).toBe(
      "Error del servidor. Intente de nuevo."
    );
  });

  it("traduce códigos PostgREST", () => {
    expect(toUserMessage({ code: "PGRST116" }, "fallback")).toBe(
      "No se encontró el registro solicitado."
    );
    expect(toUserMessage({ code: "PGRST301" }, "fallback")).toBe(
      "La sesión ha expirado. Inicie sesión nuevamente."
    );
  });

  it("usa status numérico como string", () => {
    expect(toUserMessage({ status: "403" }, "fallback")).toBe(
      "No tiene permisos para realizar esta acción."
    );
  });

  it("rechaza mensajes técnicos y usa fallback", () => {
    expect(
      toUserMessage(
        { message: 'duplicate key value violates unique constraint "estudiantes_dni_key"' },
        "No se pudo guardar"
      )
    ).toBe("No se pudo guardar");

    expect(
      toUserMessage(
        { message: 'new row violates row-level security policy for table "casos"' },
        "Sin permisos"
      )
    ).toBe("Sin permisos");

    expect(
      toUserMessage({ message: "permission denied for table atenciones" }, "x")
    ).toBe("x");

    expect(
      toUserMessage({ message: "Failed to fetch" }, "Error de red")
    ).toBe("Error de red");
  });

  it("rechaza mensajes multilinea o muy largos", () => {
    const multiline = "linea1\nlinea2";
    expect(toUserMessage({ message: multiline }, "fb")).toBe("fb");

    const long = "a".repeat(301);
    expect(toUserMessage({ message: long }, "fb")).toBe("fb");
  });

  it("preserva mensajes amigables cortos", () => {
    expect(
      toUserMessage({ message: "Se detectaron posibles duplicados." }, "fb")
    ).toBe("Se detectaron posibles duplicados.");
  });

  it("usa fallback cuando el error es null/undefined o vacío", () => {
    expect(toUserMessage(null, "fb")).toBe("fb");
    expect(toUserMessage(undefined, "fb")).toBe("fb");
    expect(toUserMessage({}, "fb")).toBe("fb");
    expect(toUserMessage({ message: "   " }, "fb")).toBe("fb");
  });

  it("prefiere code PG sobre message", () => {
    expect(
      toUserMessage(
        { code: "42501", message: "duplicate key" },
        "fb"
      )
    ).toBe("No tiene permisos para realizar esta acción.");
  });
});

describe("logClientError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loguea con prefijo [client-error] y sanitiza message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logClientError("test.ctx", {
      code: "42501",
      message: "permission denied for table casos",
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [prefix, context, payload] = spy.mock.calls[0] as [
      string,
      string,
      { code?: unknown; message?: string; ts?: string },
    ];
    expect(prefix).toBe("[client-error]");
    expect(context).toBe("test.ctx");
    expect(payload.code).toBe("42501");
    expect(payload.message).toBe("permission denied for table casos");
    expect(typeof payload.ts).toBe("string");
  });

  it("no lanza con error desconocido", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => logClientError("ctx", undefined)).not.toThrow();
    expect(spy).toHaveBeenCalled();
  });

  it("trunca mensajes largos a 200 caracteres", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logClientError("ctx", { message: "x".repeat(500) });
    const payload = spy.mock.calls[0][2] as { message: string };
    expect(payload.message.length).toBe(200);
  });
});
