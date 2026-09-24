import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((href: string) => {
  throw new Error(`NEXT_REDIRECT:${href}`);
});
vi.mock("next/navigation", () => ({
  redirect: (href: string) => redirect(href),
}));

const headersMock = vi.fn();
vi.mock("next/headers", () => ({
  headers: async () => headersMock(),
}));

const signInWithPassword = vi.fn();
const signUp = vi.fn();
const signOut = vi.fn();
const resetPasswordForEmail = vi.fn();
const updateUser = vi.fn();
const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signInWithPassword: signInWithPassword,
      signUp: signUp,
      signOut: signOut,
      resetPasswordForEmail: resetPasswordForEmail,
      updateUser: updateUser,
      getUser: getUser,
    },
  })),
}));

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

async function runRedirecting(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (e) {
    if (!(e instanceof Error && e.message.startsWith("NEXT_REDIRECT"))) throw e;
  }
}

function mockOrigin(origin: string | null) {
  headersMock.mockImplementation(async () => ({
    get: (key: string) => {
      if (key === "origin" || key === "x-forwarded-origin") return origin;
      if (key === "host") return origin ? new URL(origin).host : null;
      if (key === "x-forwarded-proto")
        return origin ? new URL(origin).protocol.replace(":", "") : null;
      return null;
    },
  }));
}

describe("auth actions (signIn/signUp/signOut)", () => {
  beforeEach(() => {
    redirect.mockClear();
    signInWithPassword.mockReset();
    signUp.mockReset();
    signOut.mockReset();
    resetPasswordForEmail.mockReset();
    updateUser.mockReset();
    getUser.mockReset();
    mockOrigin("https://example.com");
  });

  it("signIn con credenciales válidas redirige a /", async () => {
    const { signIn } = await import("@/lib/actions/auth");
    signInWithPassword.mockResolvedValue({ error: null });

    await runRedirecting(() =>
      signIn(formData({ email: "a@b.c", password: "secret" }))
    );

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "a@b.c",
      password: "secret",
    });
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("signIn con error redirige a /auth/login?error=credentials", async () => {
    const { signIn } = await import("@/lib/actions/auth");
    signInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });

    await runRedirecting(() =>
      signIn(formData({ email: "a@b.c", password: "bad" }))
    );

    expect(redirect).toHaveBeenCalledWith("/auth/login?error=credentials");
  });

  it("signUp T67: role docente + institution_code + emailRedirectTo origen", async () => {
    const { signUp: doSignUp } = await import("@/lib/actions/auth");
    signUp.mockResolvedValue({ error: null });

    await runRedirecting(() =>
      doSignUp(
        formData({
          email: "t@x.pe",
          password: "pass",
          full_name: "Docente Uno",
          document_number: "12345678",
          institution_code: "MOD-001",
        })
      )
    );

    expect(signUp).toHaveBeenCalledWith({
      email: "t@x.pe",
      password: "pass",
      options: {
        data: {
          full_name: "Docente Uno",
          document_number: "12345678",
          role: "docente",
          institution_code: "MOD-001",
        },
        emailRedirectTo: "https://example.com/auth/callback",
      },
    });
    expect(redirect).toHaveBeenCalledWith("/auth/confirmacion");
  });

  it("signUp sin institution_code redirige a error=institution", async () => {
    const { signUp: doSignUp } = await import("@/lib/actions/auth");

    await runRedirecting(() =>
      doSignUp(
        formData({
          email: "t@x.pe",
          password: "pass",
          full_name: "X",
          document_number: "1",
          institution_code: "",
        })
      )
    );

    expect(signUp).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/auth/registro?error=institution");
  });

  it("signUp con error redirige a /auth/registro?error=signup", async () => {
    const { signUp: doSignUp } = await import("@/lib/actions/auth");
    signUp.mockResolvedValue({ error: { message: "email taken" } });

    await runRedirecting(() =>
      doSignUp(
        formData({
          email: "t@x.pe",
          password: "pass",
          full_name: "X",
          document_number: "1",
          institution_code: "MOD-001",
        })
      )
    );

    expect(redirect).toHaveBeenCalledWith("/auth/registro?error=signup");
  });

  it("resetPassword usa redirectTo de origen (no localhost)", async () => {
    const { resetPassword } = await import("@/lib/actions/auth");
    resetPasswordForEmail.mockResolvedValue({ error: null });

    await runRedirecting(() => resetPassword(formData({ email: "a@b.c" })));

    expect(resetPasswordForEmail).toHaveBeenCalledWith("a@b.c", {
      redirectTo: "https://example.com/auth/nueva-clave",
    });
    expect(redirect).toHaveBeenCalledWith("/auth/recuperar?sent=1");
  });

  it("updatePassword exige sesión y redirige a login?reset=1", async () => {
    const { updatePassword } = await import("@/lib/actions/auth");
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    updateUser.mockResolvedValue({ error: null });

    await runRedirecting(() =>
      updatePassword(formData({ password: "newsecret1" }))
    );

    expect(updateUser).toHaveBeenCalledWith({ password: "newsecret1" });
    expect(redirect).toHaveBeenCalledWith("/auth/login?reset=1");
  });

  it("signOut cierra sesión y redirige a login", async () => {
    const { signOut: doSignOut } = await import("@/lib/actions/auth");
    signOut.mockResolvedValue({ error: null });

    await runRedirecting(() => doSignOut());

    expect(signOut).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/auth/login");
  });
});
