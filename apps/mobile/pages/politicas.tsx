import Head from "next/head";

type Section = {
  title: string;
  paragraphs: string[];
};

const SECTIONS: Section[] = [
  {
    title: "1. Qué información recopilamos",
    paragraphs: [
      "Solo pedimos los datos necesarios para crear tu cuenta, autenticarte y gestionar tus reservas (nombre, email, teléfono, métodos de pago autorizados y registros de asistencia).",
    ],
  },
  {
    title: "2. Cómo usamos tus datos",
    paragraphs: [
      "Utilizamos la información para verificar tu identidad, mostrarte horarios personalizados, enviar recordatorios y cumplir obligaciones de facturación cuando corresponde.",
    ],
  },
  {
    title: "3. Con quién los compartimos",
    paragraphs: [
      "Compartimos datos únicamente con los estudios afiliados, proveedores de pago y servicios necesarios para operar la aplicación. Nunca vendemos tu información.",
    ],
  },
  {
    title: "4. Conservación y seguridad",
    paragraphs: [
      "Guardamos los datos solo durante el tiempo necesario para prestar el servicio y aplicamos medidas técnicas y organizativas para evitar accesos no autorizados.",
    ],
  },
  {
    title: "5. Tus derechos",
    paragraphs: [
      "Puedes acceder, actualizar o solicitar la eliminación de tus datos escribiendo a privacidad@atpilatestime.com. También puedes retirar consentimientos relacionados con comunicaciones comerciales.",
    ],
  },
];

const LAST_UPDATED = "15 de noviembre de 2025";

export default function UsagePolicyPage() {
  return (
    <>
      <Head>
        <title>Políticas de uso y privacidad | AT Pilates Time</title>
        <meta
          name="description"
          content="Documento público sobre el uso permitido y la privacidad de la app AT Pilates Time."
        />
      </Head>
      <main className="min-h-screen bg-neutral-50 px-6 py-12 text-neutral-800">
        <article className="mx-auto max-w-3xl space-y-8 rounded-3xl bg-white p-8 shadow-lg">
          <header className="space-y-2 text-center">
            <p className="text-xs uppercase tracking-[0.35em] text-neutral-400">
              Legal
            </p>
            <h1 className="text-3xl font-bold text-neutral-900">
              Políticas de uso y privacidad
            </h1>
            <p className="text-sm text-neutral-500">
              Última actualización: {LAST_UPDATED}
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

UsagePolicyPage.publicPage = true;
