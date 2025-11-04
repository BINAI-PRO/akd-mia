import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import dayjs from "dayjs";
import AdminLayout from "@/components/admin/AdminLayout";
import { useAuth } from "@/components/auth/AuthContext";

type BarcodeDetectorHandle = {
  detect: (
    source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap | ImageBitmapSource
  ) => Promise<Array<{ rawValue: string }>>;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorHandle;

type ScanRecord = {
  bookingId: string;
  clientName: string;
  classType: string | null;
  sessionStart: string | null;
  status: string;
  message: string;
  token: string;
  timestamp: string;
};

const MAX_HISTORY = 10;
const EMPTY_TEXT = "\u2014";

function normalizeToken(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    const candidate = segments[segments.length - 1];
    if (candidate) {
      return candidate.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    }
  } catch {
    // Not a URL, fall back to string parsing
  }

  const alphanumeric = trimmed.replace(/[^A-Za-z0-9]/g, "");
  if (alphanumeric.length >= 4) {
    return alphanumeric.toUpperCase();
  }

  const trailing = trimmed.match(/[A-Za-z0-9]+$/);
  if (trailing?.[0]) {
    return trailing[0].toUpperCase();
  }

  return trimmed.toUpperCase();
}

export default function AttendanceScannerPage() {
  const { profile } = useAuth();
  const staffId = profile?.staffId ?? null;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorHandle | null>(null);
  const frameRequestRef = useRef<number | null>(null);
  const lastTokenRef = useRef<string | null>(null);
  const scannerBufferRef = useRef<string>("");
  const scannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [scannerSupported, setScannerSupported] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [history, setHistory] = useState<ScanRecord[]>([]);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const recentSuccess = useMemo(() => history[0] ?? null, [history]);

  const handleToken = useCallback(
    async (token: string, fromCamera: boolean) => {
      const normalized = normalizeToken(token);
      if (!normalized) {
        if (!fromCamera) {
          setSubmissionError("Ingresa un c\u00f3digo v\u00e1lido.");
        }
        if (fromCamera) {
          lastTokenRef.current = null;
        }
        return;
      }

      setSubmissionError(null);
      setProcessing(true);

      try {
        const response = await fetch("/api/bookings/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: normalized,
            present: true,
            actorStaffId: staffId,
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as
          | {
              bookingId: string;
              status: string;
              client: { fullName: string };
              session: { classType: string | null; startTime: string | null };
              message: string;
            }
          | { error?: string };

        if (!response.ok) {
          const message =
            (payload as { error?: string }).error ?? "No se pudo registrar la asistencia.";
          throw new Error(message);
        }

        const successPayload = payload as {
          bookingId: string;
          status: string;
          client: { fullName: string };
          session: { classType: string | null; startTime: string | null };
          message: string;
        };

        setHistory((prev) =>
          [
            {
              bookingId: successPayload.bookingId,
              clientName: successPayload.client.fullName ?? "Cliente",
              classType: successPayload.session.classType ?? null,
              sessionStart: successPayload.session.startTime ?? null,
              status: successPayload.status,
              message: successPayload.message,
              token: normalized,
              timestamp: new Date().toISOString(),
            },
            ...prev,
          ].slice(0, MAX_HISTORY)
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "No se pudo registrar la asistencia.";
        setSubmissionError(message);
      } finally {
        setProcessing(false);
        if (!fromCamera) {
          lastTokenRef.current = null;
        }
      }
    },
    [staffId]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const DetectorCtor = (window as typeof window & { BarcodeDetector?: BarcodeDetectorConstructor })
      .BarcodeDetector;

    if (!DetectorCtor) {
      setScannerSupported(false);
      return;
    }

    let cancelled = false;
    detectorRef.current = new DetectorCtor({ formats: ["qr_code"] });

    const startVideo = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        requestAnimationFrame(scanFrame);
      } catch (error) {
        setCameraError(
          error instanceof Error
            ? error.message
            : "No fue posible acceder a la c\u00e1mara para el escaneo."
        );
      }
    };

    const scanFrame = async () => {
      if (cancelled) return;
      const detector = detectorRef.current;
      const video = videoRef.current;
      if (!detector || !video) {
        frameRequestRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      if (video.readyState < 2) {
        frameRequestRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      try {
        const barcodes = await detector.detect(video);
        if (barcodes.length > 0) {
          const raw = (barcodes[0].rawValue ?? "").trim();
          if (raw && raw !== lastTokenRef.current) {
            lastTokenRef.current = raw;
            void handleToken(raw, true);
            setTimeout(() => {
              if (lastTokenRef.current === raw) {
                lastTokenRef.current = null;
              }
            }, 1500);
          }
        }
      } catch (error) {
        console.warn("Barcode detection failed", error);
      }

      frameRequestRef.current = requestAnimationFrame(scanFrame);
    };

    void startVideo();

    return () => {
      cancelled = true;
      if (frameRequestRef.current !== null) {
        cancelAnimationFrame(frameRequestRef.current);
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [handleToken]);

  const handleManualSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!manualToken.trim()) {
      setSubmissionError("Ingresa un c\u00f3digo v\u00e1lido.");
      return;
    }
    await handleToken(manualToken, false);
    setManualToken("");
  };

  const formatSessionTime = (iso: string | null) => {
    if (!iso) return EMPTY_TEXT;
    const instance = dayjs(iso);
    if (!instance.isValid()) return EMPTY_TEXT;
    return instance.format("DD MMM YYYY HH:mm");
  };

  return (
    <>
      <Head>
        <title>Control de asistencia | Panel Admin</title>
      </Head>
      <AdminLayout title="Control de asistencia" active="attendanceScanner">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <header className="mb-4 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-slate-900">
                  {"Escaneo de membres\u00eda"}
                </h1>
                <p className="text-sm text-slate-500">
                  {"Usa la c\u00e1mara para registrar autom\u00e1ticamente la asistencia del cliente."}
                </p>
              </div>
              <span className="material-icons-outlined text-3xl text-brand-600">qr_code_scanner</span>
            </header>

            {!scannerSupported && (
              <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {
                  "Tu navegador no soporta el lector de c\u00f3digos mediante c\u00e1mara. Puedes registrar asistencia ingresando el c\u00f3digo manualmente."
                }
              </div>
            )}

            {scannerSupported && (
              <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
                <video
                  ref={videoRef}
                  className="h-64 w-full object-cover opacity-80"
                  playsInline
                  muted
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-40 w-40 rounded-lg border-2 border-emerald-400/80 outline outline-2 outline-offset-4 outline-emerald-400/40" />
                </div>
              </div>
            )}

            {cameraError ? (
              <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-600">
                {cameraError}
              </p>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                {
                  "Apunta el c\u00f3digo QR del pase del cliente hacia la c\u00e1mara. El registro se realizar\u00e1 de forma autom\u00e1tica."
                }
              </p>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{"Registro manual"}</h2>
            <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={handleManualSubmit}>
              <input
                type="text"
                value={manualToken}
                onChange={(event) => setManualToken(event.target.value)}
                placeholder="C\u00f3digo QR"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-400"
                disabled={processing}
              >
                {"Registrar asistencia"}
              </button>
            </form>
            {submissionError && (
              <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                {submissionError}
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              {
                "El c\u00f3digo impreso o digital puede ingresarse tal cual aparece en el QR del cliente."
              }
            </p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {"\u00daltimos registros"}
              </h2>
              <span className="text-xs text-slate-500">
                {history.length === 0
                  ? "Sin registros a\u00fan"
                  : `${history.length} registro(s) recientes`}
              </span>
            </div>

            {recentSuccess && (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{recentSuccess.clientName}</span>
                  <span className="text-xs text-emerald-600">
                    {dayjs(recentSuccess.timestamp).format("DD MMM HH:mm")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-emerald-800">{recentSuccess.message}</p>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{"Cliente"}</th>
                    <th className="px-4 py-3">{"Clase"}</th>
                    <th className="px-4 py-3">{"Horario"}</th>
                    <th className="px-4 py-3">{"Estado"}</th>
                    <th className="px-4 py-3">{"Token"}</th>
                    <th className="px-4 py-3">{"Registrado"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {history.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-6 text-center text-sm text-slate-500"
                      >
                        {"A\u00fan no se registra asistencia desde este panel."}
                      </td>
                    </tr>
                  ) : (
                    history.map((record) => (
                      <tr key={`${record.bookingId}-${record.timestamp}`}>
                        <td className="px-4 py-3 font-medium text-slate-700">
                          {record.clientName}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {record.classType ?? "Sesi\u00f3n"}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {formatSessionTime(record.sessionStart)}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{record.status}</td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-500">{record.token}</td>
                        <td className="px-4 py-3 text-slate-500">
                          {dayjs(record.timestamp).format("DD MMM YYYY HH:mm")}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </AdminLayout>
    </>
  );
}
