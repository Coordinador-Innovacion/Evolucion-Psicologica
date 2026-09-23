import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (href: string) => redirect(href),
}));

const signInWithPassword = vi.fn();
const signUp = vi.fn();
const signOut = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signInWithPassword: signInWithPassword,
      signUp: signUp,
      signOut: signOut,
    },
  })),
}));

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

describe("auth actions (signIn/signUp/signOut)", () => {
  beforeEach(() => {
    redirect.mockClear();
    signInWithPassword.mockReset();
    signUp.mockReset();
    signOut.mockReset();
  });

  it("signIn con credenciales válidas redirige a /", async () => {
    const { signIn } = await import("@/lib/actions/auth");
    signInWithPassword.mockResolvedValue({ error: null });

    await signIn(formData({ email: "a@b.c", password: "secret" }));

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

    await signIn(formData({ email: "a@b.c", password: "bad" }));

    expect(redirect).toHaveBeenCalledWith("/auth/login?error=credentials");
  });

  it("signUp envía metadata con role docente (alta pública)", async () => {
    const { signUp: doSignUp } = await import("@/lib/actions/auth");
    signUp.mockResolvedValue({ error: null });

    await doSignUp(
      formData({
        email: "t@x.pe",
        password: "pass",
        full_name: "Docente Uno",
        document_number: "12345678",
      })
    );

    expect(signUp).toHaveBeenCalledWith({
      email: "t@x.pe",
      password: "pass",
      options: {
        data: {
          full_name: "Docente Uno",
          document_number: "12345678",
          role: "docente",
        },
      },
    });
    expect(redirect).toHaveBeenCalledWith("/auth/confirmacion");
  });

  it("signUp con error redirige a /auth/registro?error=signup", async () => {
    const { signUp: doSignUp } = await import("@/lib/actions/auth");
    signUp.mockResolvedValue({ error: { message: "email taken" } });

    await doSignUp(
      formData({
        email: "t@x.pe",
        password: "pass",
        full_name: "X",
        document_number: "1",
      })
    );

    expect(redirect).toHaveBeenCalledWith("/auth/registro?error=signup");
  });

  it("signOut cierra sesión y redirige a login", async () => {
    const { signOut: doSignOut } = await import("@/lib/actions/auth");
    signOut.mockResolvedValue({ error: null });

    await doSignOut();

    expect(signOut).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/auth/login");
  });
});
