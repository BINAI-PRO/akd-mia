import Head from "next/head";

type Section = {
  title: string;
  paragraphs: string[];
};

const SECTIONS: Section[] = [
  {
    title: "1. QuÃ© informaciÃ³n recopilamos",
    paragraphs: [
      "Solo pedimos los datos necesarios para crear tu cuenta, autenticarte y gestionar tus reservas (nombre, email, telÃ©fono, mÃ©todos de pago autorizados y registros de asistencia).",
    ],
  },
  {
    title: "2. CÃ³mo usamos tus datos",
    paragraphs: [
      "Utilizamos la informaciÃ³n para verificar tu identidad, mostrarte horarios personalizados, enviar recordatorios y cumplir obligaciones de facturaciÃ³n cuando corresponde.",
    ],
  },
  {
    title: "3. Con quiÃ©n los compartimos",
    paragraphs: [
      "Compartimos datos Ãºnicamente con los estudios afiliados, proveedores de pago y servicios necesarios para operar la aplicaciÃ³n. Nunca vendemos tu informaciÃ³n.",
    ],
  },
  {
    title: "4. ConservaciÃ³n y seguridad",
    paragraphs: [
      "Guardamos los datos solo durante el tiempo necesario para prestar el servicio y aplicamos medidas tÃ©cnicas y organizativas para evitar accesos no autorizados.",
    ],
  },
  {
    title: "5. Tus derechos",
    paragraphs: [
      "Puedes acceder, actualizar o solicitar la eliminaciÃ³n de tus datos escribiendo a privacidad@atpilatestime.com. TambiÃ©n puedes retirar consentimientos relacionados con comunicaciones comerciales.",
    ],
  },
];

const LAST_UPDATED = "15 de noviembre de 2025";

export default function UsagePolicyPage() {
  return (
    <>
      <Head>
        <title>Politicas de uso y privacidad | Akdēmia</title>
        <meta
          name="description"
          content="Documento publico sobre el uso permitido y la privacidad de la app Akdēmia"
        />
      </Head>
      <main className="min-h-screen bg-neutral-50 px-6 py-12 text-neutral-800">
        <article className="mx-auto max-w-3xl space-y-8 rounded-3xl bg-white p-8 shadow-lg">
          <header className="space-y-2 text-center">
            <p className="text-xs uppercase tracking-[0.35em] text-neutral-400">
              Legal
            </p>
            <h1 className="text-3xl font-bold text-neutral-900">
              PolÃ­ticas de uso y privacidad
            </h1>
            <p className="text-sm text-neutral-500">
              Ãšltima actualizaciÃ³n: {LAST_UPDATED}
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


