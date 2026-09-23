import Link from "next/link";

export default function ConfirmacionPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full text-center space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Evolución Psicológica
          </h1>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <div className="text-green-600 text-5xl mb-4">✓</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Cuenta creada
          </h2>
          <p className="text-gray-600 mb-6">
            Tu cuenta ha sido creada correctamente. Revisa tu correo para
            confirmar tu email antes de iniciar sesión.
          </p>

          <Link
            href="/auth/login"
            className="inline-block w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Ir a iniciar sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
