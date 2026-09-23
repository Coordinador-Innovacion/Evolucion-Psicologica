import Link from "next/link";

export default function EncuestasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              <Link
                href="/"
                className="text-xl font-bold text-gray-900"
              >
                Evolución Psicológica
              </Link>
              <Link
                href="/encuestas"
                className="text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Encuestas
              </Link>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
