export default function QRBadge({ token }:{ token:string }) {
  return (
    <div className="card p-4 flex flex-col items-center">
      <img src={`/api/qr/${token}`} alt="QR reserva" className="w-48 h-48" />
      <p className="text-sm text-neutral-500 mt-2">Muestra este QR al llegar</p>
      <a className="btn mt-4" href={`/api/qr/${token}?download=1`} download={`AT-QR-${token}.png`}>
        Descargar
      </a>
    </div>
  );
}
