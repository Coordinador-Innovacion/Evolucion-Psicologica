import Link from "next/link";
import { HomeNav } from "@/components/HomeNav";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <main className="text-center">
        <h1 className="text-4xl font-bold mb-4">Evolución Psicológica</h1>
        <p className="text-zinc-600 dark:text-zinc-400 mb-6">
          Sistema de seguimiento psicológico estudiantil
        </p>
        <HomeNav />
        <p className="mt-8 text-xs text-zinc-400">
          <Link href="/auth/login" className="hover:text-zinc-600">
            Iniciar sesión
          </Link>
        </p>
      </main>
    </div>
  );
}
