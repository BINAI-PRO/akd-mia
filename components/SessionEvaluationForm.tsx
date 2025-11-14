import { useCallback, useEffect, useMemo, useState } from "react";
import { madridDayjs } from "@/lib/timezone";

const RATING_FIELDS = [
  "reserva",
  "recepcion",
  "limpieza",
  "iluminacion",
  "clima",
  "ruido",
  "salon",
  "equipoCondicion",
  "equipoDisponibilidad",
  "instTrato",
  "instClaridad",
  "instTecnica",
] as const;

type RatingField = (typeof RATING_FIELDS)[number];

type RatingsState = Record<RatingField, number | null>;

type DiscomfortState = { value: boolean; notes: string };

type EvaluationPayload = {
  id: string;
  bookingId: string;
  updatedAt: string;
  ratings: Record<RatingField, number>;
  discomfort: { value: boolean; notes: string | null };
  nps: number | null;
  comment: string | null;
  summary: {
    recepcion: number;
    ambiente: number;
    equipo: number;
    instructor: number;
    global: number;
  };
};

type FetchResponse = {
  evaluation: EvaluationPayload | null;
  allowed: boolean;
  availableAt: string | null;
};

type Props = {
  bookingId: string;
  sessionEndISO: string;
};

const LIKERT_EMOJI: Record<number, string> = {
  1: "😞",
  2: "😕",
  3: "😐",
  4: "🙂",
  5: "😄",
};

const NPS_VALUES = Array.from({ length: 11 }, (_, index) => index);

function createEmptyRatings(): RatingsState {
  return RATING_FIELDS.reduce((acc, field) => {
    acc[field] = null;
    return acc;
  }, {} as RatingsState);
}

function serializeSnapshot(form: {
  ratings: RatingsState;
  discomfort: DiscomfortState;
  nps: number | null;
  comment: string;
}) {
  return JSON.stringify({
    ratings: form.ratings,
    discomfort: form.discomfort,
    nps: form.nps,
    comment: form.comment,
  });
}

export default function SessionEvaluationForm({ bookingId, sessionEndISO }: Props) {
  const [ratings, setRatings] = useState<RatingsState>(() => createEmptyRatings());
  const [discomfort, setDiscomfort] = useState<DiscomfortState>({ value: false, notes: "" });
  const [nps, setNps] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [allowed, setAllowed] = useState(false);
  const [availableAt, setAvailableAt] = useState<string | null>(sessionEndISO);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );
  const [baselineKey, setBaselineKey] = useState<string>(() =>
    serializeSnapshot({
      ratings: createEmptyRatings(),
      discomfort: { value: false, notes: "" },
      nps: null,
      comment: "",
    })
  );
  const [summary, setSummary] = useState<EvaluationPayload["summary"] | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [lastSavedForm, setLastSavedForm] = useState<{
    ratings: RatingsState;
    discomfort: DiscomfortState;
    nps: number | null;
    comment: string;
  }>({
    ratings: createEmptyRatings(),
    discomfort: { value: false, notes: "" },
    nps: null,
    comment: "",
  });

  const snapshot = useMemo(
    () =>
      serializeSnapshot({
        ratings,
        discomfort,
        nps,
        comment,
      }),
    [ratings, discomfort, nps, comment]
  );

  const completed = useMemo(
    () =>
      RATING_FIELDS.reduce((acc, field) => {
        return ratings[field] !== null ? acc + 1 : acc;
      }, 0),
    [ratings]
  );

  const isDirty = snapshot !== baselineKey;
  const canSubmit = allowed && completed === RATING_FIELDS.length && !saving && isDirty;

  const formatDateTime = (iso: string | null) => {
    if (!iso) return null;
    try {
      return madridDayjs(iso).format("DD MMM YYYY HH:mm");
    } catch {
      return iso;
    }
  };

  const applyEvaluation = useCallback((evaluation: EvaluationPayload | null) => {
    if (!evaluation) {
      const emptyRatings = createEmptyRatings();
      const emptyForm = {
        ratings: emptyRatings,
        discomfort: { value: false, notes: "" },
        nps: null,
        comment: "",
      };
      setRatings(emptyRatings);
      setDiscomfort(emptyForm.discomfort);
      setNps(emptyForm.nps);
      setComment(emptyForm.comment);
      setSummary(null);
      setLastUpdatedAt(null);
      setBaselineKey(serializeSnapshot(emptyForm));
      setLastSavedForm(emptyForm);
      return;
    }

    const nextRatings = RATING_FIELDS.reduce((acc, field) => {
      acc[field] = evaluation.ratings[field] ?? null;
      return acc;
    }, {} as RatingsState);

    const nextForm = {
      ratings: nextRatings,
      discomfort: {
        value: evaluation.discomfort.value,
        notes: evaluation.discomfort.notes ?? "",
      },
      nps: evaluation.nps ?? null,
      comment: evaluation.comment ?? "",
    };

    setRatings(nextRatings);
    setDiscomfort(nextForm.discomfort);
    setNps(nextForm.nps);
    setComment(nextForm.comment);
    setSummary(evaluation.summary);
    setLastUpdatedAt(evaluation.updatedAt);
    setBaselineKey(serializeSnapshot(nextForm));
    setLastSavedForm(nextForm);
  }, []);

  const fetchEvaluation = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(`/api/bookings/${bookingId}/evaluation`);
      const payload = (await response.json().catch(() => ({}))) as FetchResponse & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo cargar la evaluación");
      }
      setAllowed(payload.allowed);
      setAvailableAt(payload.availableAt ?? null);
      applyEvaluation(payload.evaluation);
    } catch (fetchError) {
      const message =
        fetchError instanceof Error ? fetchError.message : "No se pudo cargar la evaluación";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [applyEvaluation, bookingId]);

  useEffect(() => {
    fetchEvaluation();
  }, [fetchEvaluation]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/bookings/${bookingId}/evaluation`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ratings,
          discomfort,
          nps,
          comment,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        evaluation?: EvaluationPayload;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo guardar la evaluación");
      }
      applyEvaluation(payload.evaluation ?? null);
      setFeedback({ type: "success", message: "¡Gracias! Guardamos tu evaluación." });
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "No se pudo guardar la evaluación";
      setFeedback({ type: "error", message });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setRatings(lastSavedForm.ratings);
    setDiscomfort(lastSavedForm.discomfort);
    setNps(lastSavedForm.nps);
    setComment(lastSavedForm.comment);
    setFeedback(null);
  };

  const renderAvailabilityMessage = () => {
    if (allowed) return null;
    const message =
      availableAt && madridDayjs(availableAt).isValid()
        ? `Podrás evaluar a partir del ${madridDayjs(availableAt).format("DD MMM HH:mm")}.`
        : "La evaluación se habilita cuando termine tu clase.";
    return (
      <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        {message}
      </div>
    );
  };

  return (
    <section className="card space-y-4 p-4">
      <header>
        <p className="text-xs uppercase tracking-wide text-brand-600">Evalúa tu sesión</p>
        <h2 className="text-lg font-semibold text-neutral-900">QuickCheck Pilates</h2>
        <p className="text-sm text-neutral-500">
          Comparte tu experiencia; toma menos de 5 minutos.
        </p>
      </header>

      {loading ? (
        <div className="rounded-md border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          Cargando formulario…
        </div>
      ) : error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          <p>{error}</p>
          <button
            type="button"
            className="mt-3 rounded-md border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
            onClick={fetchEvaluation}
          >
            Reintentar
          </button>
        </div>
      ) : (
        <>
          {!allowed ? (
            renderAvailabilityMessage()
          ) : (
            <>
              <div className="rounded-lg border border-slate-100 bg-white p-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Campos completados</span>
                  <span>
                    {completed}/{RATING_FIELDS.length}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all"
                    style={{ width: `${Math.round((completed / RATING_FIELDS.length) * 100)}%` }}
                  />
                </div>
              </div>

              {RATING_FIELDS.map((field) => (
                <div key={field} className="rounded-lg border border-slate-100 bg-white p-3">
                  <p className="text-sm font-medium text-slate-800">
                    {FIELD_LABELS[field]} <span className="text-brand-500">*</span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[1, 2, 3, 4, 5].map((value) => {
                      const active = ratings[field] === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() =>
                            setRatings((prev) => ({
                              ...prev,
                              [field]: value,
                            }))
                          }
                          className={`flex items-center gap-1 rounded-full border px-4 py-1 text-sm font-medium transition ${
                            active
                              ? "border-brand-500 bg-brand-50 text-brand-700 shadow-sm"
                              : "border-slate-200 bg-white text-slate-600"
                          }`}
                        >
                          <span>{LIKERT_EMOJI[value]}</span>
                          <span>{value}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="rounded-lg border border-slate-100 bg-white p-3 space-y-3">
                <p className="text-sm font-medium text-slate-800">
                  ¿Algo te incomodó físicamente? <span className="text-brand-500">*</span>
                </p>
                <div className="flex gap-2">
                  {["no", "si"].map((option) => {
                    const active = option === "si" ? discomfort.value : !discomfort.value;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() =>
                          setDiscomfort((prev) => ({
                            value: option === "si",
                            notes: option === "si" ? prev.notes : "",
                          }))
                        }
                        className={`flex-1 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                          active
                            ? "border-brand-500 bg-brand-50 text-brand-700"
                            : "border-slate-200 bg-white text-slate-500"
                        }`}
                      >
                        {option === "si" ? "Sí" : "No"}
                      </button>
                    );
                  })}
                </div>
                {discomfort.value ? (
                  <textarea
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                    placeholder="Cuéntanos qué parte del cuerpo, ejercicio o equipo te incomodó"
                    value={discomfort.notes}
                    maxLength={1000}
                    onChange={(event) =>
                      setDiscomfort((prev) => ({
                        ...prev,
                        notes: event.target.value,
                      }))
                    }
                  />
                ) : null}
              </div>

              <div className="rounded-lg border border-slate-100 bg-white p-3 space-y-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    ¿Recomendarías el estudio? (0-10)
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {NPS_VALUES.map((value) => {
                      const active = nps === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          className={`rounded-md border px-3 py-1 text-sm font-semibold transition ${
                            active
                              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-white text-slate-600"
                          }`}
                          onClick={() => setNps(value)}
                        >
                          {value}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-500"
                      onClick={() => setNps(null)}
                    >
                      Limpiar
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">Comentario adicional</p>
                  <textarea
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                    rows={3}
                    maxLength={1500}
                    placeholder="Algo que podamos mejorar o reconocer"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                  />
                </div>
              </div>

              {summary && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                    Último resumen
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-emerald-900">
                    <div>
                      <p className="text-xs text-emerald-700">Recepción</p>
                      <p className="text-lg font-semibold">{summary.recepcion.toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-emerald-700">Ambiente</p>
                      <p className="text-lg font-semibold">{summary.ambiente.toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-emerald-700">Equipo</p>
                      <p className="text-lg font-semibold">{summary.equipo.toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-emerald-700">Instructor</p>
                      <p className="text-lg font-semibold">{summary.instructor.toFixed(1)}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-emerald-700">Global</p>
                      <p className="text-lg font-semibold">{summary.global.toFixed(1)}</p>
                    </div>
                  </div>
                  {lastUpdatedAt && (
                    <p className="mt-2 text-xs text-emerald-700">
                      Enviado: {formatDateTime(lastUpdatedAt) ?? lastUpdatedAt}
                    </p>
                  )}
                </div>
              )}

              {feedback && (
                <div
                  className={`rounded-md px-4 py-2 text-sm ${
                    feedback.type === "success"
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border border-rose-200 bg-rose-50 text-rose-600"
                  }`}
                >
                  {feedback.message}
                </div>
              )}

              <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Restablecer
                </button>
                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={handleSubmit}
                  className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300"
                >
                  {saving ? "Enviando…" : "Enviar evaluación"}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

const FIELD_LABELS: Record<RatingField, string> = {
  reserva: "Proceso de reserva / check-in",
  recepcion: "Trato de recepción",
  limpieza: "Limpieza general",
  iluminacion: "Iluminación",
  clima: "Temperatura / ventilación",
  ruido: "Ruido / ambiente sonoro",
  salon: "Comodidad del salón / espacio",
  equipoCondicion: "Condición del equipo",
  equipoDisponibilidad: "Disponibilidad / uso del equipo",
  instTrato: "Trato humano / respeto",
  instClaridad: "Claridad de indicaciones / seguridad",
  instTecnica: "Técnica / corrección postural",
};
