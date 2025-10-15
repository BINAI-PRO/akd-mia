import Img from "@/components/Img";

export default function QRBadge({ token }: { token: string }) {
  return (
    <div className="card p-4 flex flex-col items-center">
      <Img src={`/api/qr/${token}`} alt="QR reserva" width={192} height={192} className="w-48 h-48" />
      <p className="text-sm text-neutral-500 mt-2">Muestra este QR al llegar</p>
      <a className="btn mt-4" href={`/api/qr/${token}?download=1`} download={`AT-QR-${token}.png`}>
        Descargar
      </a>
    </div>
  );
}
