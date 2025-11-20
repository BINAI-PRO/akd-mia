import Head from "next/head";

type Section = {
  title: string;
  paragraphs: string[];
};

const SECTIONS: Section[] = [
  {
    title: "1. Aceptacion del servicio",
    paragraphs: [
      "Al acceder o utilizar la aplicacion Akdemia by BInAI aceptas estos terminos y te comprometes a cumplirlos.",
    ],
  },
  {
    title: "2. Uso permitido",
    paragraphs: [
      "La app esta pensada para reservar, gestionar y pagar tus clases de Pilates en los estudios autorizados. No puedes usarla de forma fraudulenta, compartir accesos sin permiso ni intentar interferir con su funcionamiento.",
    ],
  },
  {
    title: "3. Cuentas y seguridad",
    paragraphs: [
      "Eres responsable de la confidencialidad de tus credenciales. Si detectas actividad sospechosa contactanos para bloquear tu sesion y proteger tus reservas.",
    ],
  },
  {
    title: "4. Pagos y cancelaciones",
    paragraphs: [
      "Cada plan o sesion puede tener reglas especificas de cancelacion que veras antes de confirmar. Nos reservamos el derecho de hacer ajustes cuando sea necesario para proteger al estudio y a otros alumnos.",
    ],
  },
  {
    title: "5. Actualizaciones",
    paragraphs: [
      "Podemos actualizar estos terminos en cualquier momento. Publicaremos la ultima version en esta misma pagina y el uso continuado significara que aceptas los cambios.",
    ],
  },
  {
    title: "6. Contacto",
    paragraphs: [
      "Si tienes dudas o necesitas ejercer tus derechos, escribenos a hola@atpilatestime.com.",
    ],
  },
];

const LAST_UPDATED = "15 de noviembre de 2025";

export default function TermsOfServicePage() {
  return (
    <>
      <Head>
        <title>Terminos de servicio | Akdemia by BInAI</title>
        <meta
          name="description"
          content="Consulta los terminos de servicio oficiales de la app Akdemia by BInAI"
        />
      </Head>
      <main className="min-h-screen bg-neutral-50 px-6 py-12 text-neutral-800">
        <article className="mx-auto max-w-3xl space-y-8 rounded-3xl bg-white p-8 shadow-lg">
          <header className="space-y-2 text-center">
            <p className="text-xs uppercase tracking-[0.35em] text-neutral-400">
              Legal
            </p>
            <h1 className="text-3xl font-bold text-neutral-900">
              Terminos de servicio
            </h1>
            <p className="text-sm text-neutral-500">
              Ultima actualizacion: {LAST_UPDATED}
            </p>
          </header>

          <div className="space-y-6 text-base leading-relaxed">
            {SECTIONS.map((section) => (
              <section key={section.title} className="space-y-3">
                <h2 className="text-lg font-semibold text-neutral-900">{section.title}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </section>
            ))}
          </div>
        </article>
      </main>
    </>
  );
}

TermsOfServicePage.publicPage = true;
