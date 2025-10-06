
import * as React from "react";
import Head from "next/head";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import type { Tables } from "@/types/database";

const REASON_OPTIONS = [
  { value: "mantenimiento", label: "Mantenimiento" },
  { value: "limpieza", label: "Limpieza" },
  { value: "interno", label: "Evento interno" },
  { value: "otro", label: "Otro" },
] as const;

type BlockReason = (typeof REASON_OPTIONS)[number]["value"];

const REASON_LABEL: Record<BlockReason, string> = {
  mantenimiento: "Mantenimiento",
  limpieza: "Limpieza",
  interno: "Evento interno",
  otro: "Otro",
};

const WEEKDAY_LABELS = [
  { value: 0, label: "Lunes" },
  { value: 1, label: "Martes" },
  { value: 2, label: "Miercoles" },
  { value: 3, label: "Jueves" },
  { value: 4, label: "Viernes" },
  { value: 5, label: "Sabado" },
  { value: 6, label: "Domingo" },
];

const uid = () => Math.random().toString(36).slice(2, 10);

type RoomSummary = {
  id: string;
  name: string;
  capacity: number;
  location: string | null;
};

type ApparatusOption = {
  id: string;
  name: string;
};

type RoomDetail = {
  id: string;
  name: string;
  capacity: number;
  location: string | null;
  apparatus: {
    id: string;
    apparatusId: string;
    apparatusName: string | null;
    quantity: number;
  }[];
  blocks: {
    id: string;
    startsAt: string;
    endsAt: string;
    reason: string | null;
    note: string | null;
  }[];
  recurringBlocks: {
    id: string;
    weekday: number;
    startTime: string;
    endTime: string;
    reason: string | null;
    note: string | null;
  }[];
  supportsApparatus: boolean;
};

type PageProps = {
  rooms: RoomSummary[];
  apparatus: ApparatusOption[];
  initialRoom: RoomDetail | null;
  supportsLocation: boolean;
  supportsApparatus: boolean;
};

type RoomRow = Tables<"rooms">;
type ApparatusRow = Tables<"apparatus">;
type RoomAppRow = Tables<"room_apparatus"> & {
  apparatus: Pick<ApparatusRow, "id" | "name"> | null;
};
type RoomBlockRow = Tables<"room_blocks">;
type RoomRecurringRow = Tables<"room_recurring_blocks">;

const normalizeRoomSummary = (row: RoomRow): RoomSummary => ({
  id: row.id,
  name: row.name,
  capacity: row.capacity,
  location: Object.prototype.hasOwnProperty.call(row, "location") ? row.location ?? null : null,
});

const normalizeApparatusOption = (row: ApparatusRow): ApparatusOption => ({ id: row.id, name: row.name });

const isRelationMissing = (error: any) =>
  error?.code === "PGRST205" || error?.code === "42P01" || /does not exist/i.test(error?.message ?? "");

const normalizeDetail = (
  room: RoomRow,
  apparatus: RoomAppRow[] | null,
  blocks: RoomBlockRow[] | null,
  recurring: RoomRecurringRow[] | null,
  supportsApparatus: boolean
): RoomDetail => ({
  id: room.id,
  name: room.name,
  capacity: room.capacity,
  location: Object.prototype.hasOwnProperty.call(room, "location") ? room.location ?? null : null,
  apparatus:
    supportsApparatus
      ? apparatus?.map((item) => ({
          id: item.id,
          apparatusId: item.apparatus_id,
          apparatusName: item.apparatus?.name ?? null,
          quantity: item.quantity,
        })) ?? []
      : [],
  blocks:
    blocks?.map((item) => ({
      id: item.id,
      startsAt: item.starts_at,
      endsAt: item.ends_at,
      reason: item.reason ?? null,
      note: item.note ?? null,
    })) ?? [],
  recurringBlocks:
    recurring?.map((item) => ({
      id: item.id,
      weekday: item.weekday,
      startTime: item.start_time,
      endTime: item.end_time,
      reason: item.reason ?? null,
      note: item.note ?? null,
    })) ?? [],
  supportsApparatus,
});
const fetchRoomDetail = async (
  roomId: string,
  options?: { supportsApparatus?: boolean }
): Promise<RoomDetail | null> => {
  const { data: room, error: roomError } = await supabaseAdmin
    .from("rooms")
    .select("*")
    .eq("id", roomId)
    .single<RoomRow>();
  if (roomError) throw roomError;
  if (!room) return null;

  let supportsApparatus = options?.supportsApparatus ?? true;
  let apparatusRows: RoomAppRow[] = [];
  if (supportsApparatus) {
    const { data, error } = await supabaseAdmin
      .from("room_apparatus")
      .select("id, apparatus_id, quantity, room_id, created_at, apparatus:apparatus_id (id, name)")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .returns<RoomAppRow[]>();
    if (error) {
      if (isRelationMissing(error)) {
        supportsApparatus = false;
      } else {
        throw error;
      }
    } else {
      apparatusRows = data ?? [];
    }
  }

  const { data: blocks, error: blockError } = await supabaseAdmin
    .from("room_blocks")
    .select("id, room_id, starts_at, ends_at, reason, note, created_at")
    .eq("room_id", roomId)
    .order("starts_at", { ascending: false })
    .returns<RoomBlockRow[]>();
  if (blockError) throw blockError;

  const { data: recurring, error: recurringError } = await supabaseAdmin
    .from("room_recurring_blocks")
    .select("id, room_id, weekday, start_time, end_time, reason, note, created_at")
    .eq("room_id", roomId)
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true })
    .returns<RoomRecurringRow[]>();
  if (recurringError) throw recurringError;

  return normalizeDetail(room, apparatusRows, blocks ?? [], recurring ?? [], supportsApparatus);

};

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const { data: roomsRaw, error: roomsError } = await supabaseAdmin
    .from("rooms")
    .select("*")
    .order("name", { ascending: true })
    .returns<RoomRow[]>();
  if (roomsError) throw roomsError;

  const { data: apparatusRaw, error: apparatusError } = await supabaseAdmin
    .from("apparatus")
    .select("id, name")
    .order("name", { ascending: true })
    .returns<ApparatusRow[]>();
  if (apparatusError) throw apparatusError;

  const roomsData = roomsRaw ?? [];
  let supportsLocation = false;
  if (roomsData.length > 0) {
    supportsLocation = Object.prototype.hasOwnProperty.call(roomsData[0], "location");
  } else {
    const { error: locationCheck } = await supabaseAdmin
      .from("rooms")
      .select("location")
      .limit(1);
    if (locationCheck && locationCheck.code === "42703") {
      supportsLocation = false;
    } else if (locationCheck) {
      throw locationCheck;
    } else {
      supportsLocation = true;
    }
  }

  let supportsApparatus = true;
  const { error: apparatusLinkError } = await supabaseAdmin.from("room_apparatus").select("id").limit(1);
  if (apparatusLinkError) {
    if (isRelationMissing(apparatusLinkError)) {
      supportsApparatus = false;
    } else {
      throw apparatusLinkError;
    }
  }

  const rooms = roomsData.map(normalizeRoomSummary);
  let initialRoom: RoomDetail | null = null;
  if (rooms.length > 0) {
    initialRoom = await fetchRoomDetail(rooms[0].id, { supportsApparatus });
    supportsApparatus = initialRoom?.supportsApparatus ?? supportsApparatus;
  }

  return {
    props: {
      rooms,
      apparatus: (apparatusRaw ?? []).map(normalizeApparatusOption),
      initialRoom,
      supportsLocation,
      supportsApparatus,
    },
  };
};
type ApparatusLine = {
  localId: string;
  apparatusId: string;
  quantity: number;
};

type RecurringRange = {
  localId: string;
  backendId: string | null;
  startTime: string;
  endTime: string;
  reason: BlockReason;
  note: string;
};

type RecurringDay = {
  weekday: number;
  label: string;
  ranges: RecurringRange[];
};

const initialDayState = (): RecurringDay[] =>
  WEEKDAY_LABELS.map((day) => ({
    weekday: day.value,
    label: day.label,
    ranges: [],
  }));

const toRecurringState = (rows: RoomDetail["recurringBlocks"]): RecurringDay[] => {
  const days = initialDayState();
  rows.forEach((row) => {
    const day = days.find((d) => d.weekday === row.weekday);
    if (!day) return;
    day.ranges.push({
      localId: row.id || uid(),
      backendId: row.id,
      startTime: row.startTime,
      endTime: row.endTime,
      reason: (row.reason as BlockReason) || "mantenimiento",
      note: row.note ?? "",
    });
  });
  return days;
};

const groupRecurringResponse = (rows: RoomDetail["recurringBlocks"]): RecurringDay[] => {
  const days = initialDayState();
  rows.forEach((row) => {
    const day = days.find((d) => d.weekday === row.weekday);
    if (!day) return;
    day.ranges.push({
      localId: row.id || uid(),
      backendId: row.id,
      startTime: row.startTime,
      endTime: row.endTime,
      reason: (row.reason as BlockReason) || "mantenimiento",
      note: row.note ?? "",
    });
  });
  return days;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return value;
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

const formatTime = (value: string) => {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return value.slice(11, 16);
  return new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(date);
};

const formatRangeLabel = (startIso: string, endIso: string) => {
  const startDate = new Date(startIso);
  const endDate = new Date(endIso);
  if (!Number.isFinite(startDate.valueOf()) || !Number.isFinite(endDate.valueOf())) {
    return `${startIso} · ${endIso}`;
  }
  const sameDay = startDate.toDateString() === endDate.toDateString();
  const datePart = sameDay ? formatDate(startIso) : `${formatDate(startIso)} → ${formatDate(endIso)}`;
  return `${datePart} • ${formatTime(startIso)} – ${formatTime(endIso)}`;
};

const combineDateTime = (date: string, time: string, fallback: string) => {
  const baseDate = date || "";
  const baseTime = time || fallback;
  if (!baseDate) return null;
  const value = `${baseDate}T${baseTime}`;
  const asDate = new Date(value);
  if (!Number.isFinite(asDate.valueOf())) return null;
  return asDate.toISOString();
};

const findReasonLabel = (value: string | null) => {
  if (!value) return "Sin motivo";
  return REASON_LABEL[value as BlockReason] ?? "Sin motivo";
};
const AparatosLista = ({
  lines,
  options,
  onChange,
  onRemove,
}: {
  lines: ApparatusLine[];
  options: ApparatusOption[];
  onChange: (lineId: string, next: ApparatusLine) => void;
  onRemove: (lineId: string) => void;
}) => (
  <div className="space-y-3">
    {lines.map((line) => (
      <div
        key={line.localId}
        className="grid grid-cols-1 gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-[minmax(0,1fr),140px,auto]"
      >
        <select
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={line.apparatusId}
          onChange={(event) =>
            onChange(line.localId, {
              ...line,
              apparatusId: event.target.value,
            })
          }
        >
          <option value="">Selecciona un recurso</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={line.quantity}
          onChange={(event) =>
            onChange(line.localId, {
              ...line,
              quantity: Number(event.target.value) || 1,
            })
          }
        />
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          onClick={() => onRemove(line.localId)}
        >
          <span className="material-icons-outlined text-base">delete</span>
          Quitar
        </button>
      </div>
    ))}
  </div>
);

const RecurringDayEditor = ({
  day,
  onChange,
}: {
  day: RecurringDay;
  onChange: (next: RecurringDay) => void;
}) => {
  const addRange = () => {
    onChange({
      ...day,
      ranges: [
        ...day.ranges,
        {
          localId: uid(),
          backendId: null,
          startTime: "08:00",
          endTime: "10:00",
          reason: "mantenimiento",
          note: "",
        },
      ],
    });
  };

  const updateRange = (localId: string, updater: (prev: RecurringRange) => RecurringRange) => {
    onChange({
      ...day,
      ranges: day.ranges.map((range) => (range.localId === localId ? updater(range) : range)),
    });
  };

  const removeRange = (localId: string) => {
    onChange({
      ...day,
      ranges: day.ranges.filter((range) => range.localId !== localId),
    });
  };

  return (
    <div className="rounded-lg border border-slate-200">
      <header className="border-b border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">{day.label}</header>
      <div className="space-y-3 px-4 py-3">
        {day.ranges.length === 0 ? (
          <p className="text-sm text-slate-500">Sin bloqueos activos.</p>
        ) : (
          day.ranges.map((range) => (
            <div key={range.localId} className="flex flex-wrap items-center gap-2">
              <input
                type="time"
                className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={range.startTime}
                onChange={(event) =>
                  updateRange(range.localId, (prev) => ({ ...prev, startTime: event.target.value }))
                }
              />
              <span className="text-slate-500">a</span>
              <input
                type="time"
                className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={range.endTime}
                onChange={(event) =>
                  updateRange(range.localId, (prev) => ({ ...prev, endTime: event.target.value }))
                }
              />
              <select
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={range.reason}
                onChange={(event) =>
                  updateRange(range.localId, (prev) => ({ ...prev, reason: event.target.value as BlockReason }))
                }
              >
                {REASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                className="flex-1 min-w-[120px] rounded-md border border-slate-300 px-2 py-1 text-sm"
                placeholder="Nota (opcional)"
                value={range.note}
                onChange={(event) =>
                  updateRange(range.localId, (prev) => ({ ...prev, note: event.target.value }))
                }
              />
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                onClick={() => removeRange(range.localId)}
              >
                <span className="material-icons-outlined text-base">delete</span>
                Quitar
              </button>
            </div>
          ))
        )}
        <button
          type="button"
          className="text-xs font-medium text-indigo-600 hover:underline"
          onClick={addRange}
        >
          + Agregar rango
        </button>
      </div>
    </div>
  );
};
export default function PlanningRoomsPage({
  rooms: initialRooms,
  apparatus,
  initialRoom,
  supportsLocation,
  supportsApparatus: initialSupportsApparatus,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [rooms, setRooms] = React.useState<RoomSummary[]>(initialRooms);
  const [selectedRoomId, setSelectedRoomId] = React.useState<string | null>(initialRoom?.id ?? initialRooms[0]?.id ?? null);
  const [roomDetail, setRoomDetail] = React.useState<RoomDetail | null>(initialRoom);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [apparatusSupported, setApparatusSupported] = React.useState(
    initialRoom?.supportsApparatus ?? initialSupportsApparatus
  );

  const [name, setName] = React.useState(initialRoom?.name ?? "");
  const [location, setLocation] = React.useState(initialRoom?.location ?? "");
  const [capacity, setCapacity] = React.useState<number>(initialRoom?.capacity ?? 1);
  const initialApparatusLines: ApparatusLine[] = initialRoom?.supportsApparatus
    ? (initialRoom.apparatus ?? []).map((item) => ({
        localId: item.id || uid(),
        apparatusId: item.apparatusId,
        quantity: item.quantity,
      }))
    : [];
  const [apparatusLines, setApparatusLines] = React.useState<ApparatusLine[]>(initialApparatusLines);
  const [blocks, setBlocks] = React.useState<RoomDetail["blocks"]>(initialRoom?.blocks ?? []);
  const [recurring, setRecurring] = React.useState<RecurringDay[]>(
    initialRoom ? toRecurringState(initialRoom.recurringBlocks) : initialDayState()
  );

  const [tab, setTab] = React.useState<"fecha" | "recurrente">("fecha");
  const [feedback, setFeedback] = React.useState<{ type: "success" | "error"; message: string } | null>(null);
  const [saving, setSaving] = React.useState(false);

  const [blockStartDate, setBlockStartDate] = React.useState("");
  const [blockEndDate, setBlockEndDate] = React.useState("");
  const [blockStartTime, setBlockStartTime] = React.useState("");
  const [blockEndTime, setBlockEndTime] = React.useState("");
  const [blockReason, setBlockReason] = React.useState<BlockReason>("mantenimiento");
  const [blockNote, setBlockNote] = React.useState("");
  const [blockSaving, setBlockSaving] = React.useState(false);
  const [removingBlockId, setRemovingBlockId] = React.useState<string | null>(null);

  const [recurringSaving, setRecurringSaving] = React.useState(false);

  const [creating, setCreating] = React.useState(false);
  const [createName, setCreateName] = React.useState("");
  const [createLocation, setCreateLocation] = React.useState("");
  const [createCapacity, setCreateCapacity] = React.useState<number>(6);
  const [createLoading, setCreateLoading] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const resetFormFromDetail = React.useCallback((detail: RoomDetail | null) => {
    setName(detail?.name ?? "");
    setLocation(detail?.location ?? "");
    setCapacity(detail?.capacity ?? 1);
    const nextSupportsApparatus = detail?.supportsApparatus ?? initialSupportsApparatus;
    setApparatusSupported(nextSupportsApparatus);
    setApparatusLines(
      nextSupportsApparatus
        ? (detail?.apparatus ?? []).map((item) => ({
            localId: item.id || uid(),
            apparatusId: item.apparatusId,
            quantity: item.quantity,
          }))
        : []
    );
    setBlocks(detail?.blocks ?? []);
    setRecurring(detail ? toRecurringState(detail.recurringBlocks) : initialDayState());
  }, [initialSupportsApparatus]);

  const loadRoom = React.useCallback(
    async (roomId: string) => {
      setLoadingDetail(true);
      setFeedback(null);
      try {
        const response = await fetch(`/api/admin/rooms/${roomId}`);
        if (!response.ok) {
          throw new Error(`No fue posible cargar la sala (${response.status})`);
        }
        const detail = (await response.json()) as RoomDetail;
        setRoomDetail(detail);
        resetFormFromDetail(detail);
      } catch (error: any) {
        console.error(error);
        setFeedback({ type: "error", message: error?.message ?? "Error desconocido al cargar la sala" });
      } finally {
        setLoadingDetail(false);
      }
    },
    [resetFormFromDetail]
  );

  React.useEffect(() => {
    if (!selectedRoomId) {
      setRoomDetail(null);
      resetFormFromDetail(null);
      return;
    }
    if (roomDetail && roomDetail.id === selectedRoomId) return;
    void loadRoom(selectedRoomId);
  }, [selectedRoomId, roomDetail, loadRoom, resetFormFromDetail]);

  const onSelectRoom = (roomId: string) => {
    if (roomId === selectedRoomId) return;
    setSelectedRoomId(roomId);
  };

  const addApparatusLine = () => {
    if (!apparatusSupported) return;
    setApparatusLines((prev) => [...prev, { localId: uid(), apparatusId: "", quantity: 1 }]);
  };

  const updateApparatusLine = (lineId: string, next: ApparatusLine) => {
    if (!apparatusSupported) return;
    setApparatusLines((prev) => prev.map((line) => (line.localId === lineId ? next : line)));
  };

  const removeApparatusLine = (lineId: string) => {
    if (!apparatusSupported) return;
    setApparatusLines((prev) => prev.filter((line) => line.localId !== lineId));
  };

  const onSaveRoom = async () => {
    if (!selectedRoomId) return;
    setSaving(true);
    setFeedback(null);
    try {
      if (!name.trim()) {
        throw new Error("El nombre de la sala es obligatorio");
      }
      if (!Number.isFinite(capacity) || capacity <= 0) {
        throw new Error("La capacidad debe ser mayor a 0");
      }

      const sanitized = apparatusSupported
        ? apparatusLines
            .map((line) => ({ apparatusId: line.apparatusId, quantity: Number(line.quantity) }))
            .filter((line) => line.apparatusId && line.quantity > 0)
        : [];

      if (apparatusSupported) {
        const uniqueCheck = new Set<string>();
        for (const item of sanitized) {
          if (uniqueCheck.has(item.apparatusId)) {
            throw new Error("Cada aparato solo puede registrarse una vez por sala");
          }
          uniqueCheck.add(item.apparatusId);
        }
      }

      const response = await fetch(`/api/admin/rooms/${selectedRoomId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          location: supportsLocation ? location : undefined,
          capacity,
          apparatus: sanitized,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "No fue posible guardar la sala");
      }
      const detail = (await response.json()) as RoomDetail;
      setRoomDetail(detail);
      resetFormFromDetail(detail);
      setRooms((prev) =>
        prev
          .map((room) =>
            room.id === detail.id
              ? { id: detail.id, name: detail.name, capacity: detail.capacity, location: supportsLocation ? detail.location ?? null : null }
              : room
          )
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setFeedback({ type: "success", message: "Sala guardada correctamente" });
    } catch (error: any) {
      console.error(error);
      setFeedback({ type: "error", message: error?.message ?? "Error al guardar la sala" });
    } finally {
      setSaving(false);
    }
  };

  const onCancelRoom = () => {
    resetFormFromDetail(roomDetail);
    setFeedback(null);
  };

  const onCreateRoom = async () => {
    setCreateError(null);
    if (!createName.trim()) {
      setCreateError("El nombre es obligatorio");
      return;
    }
    if (!Number.isFinite(createCapacity) || createCapacity <= 0) {
      setCreateError("La capacidad debe ser mayor a 0");
      return;
    }
    setCreateLoading(true);
    try {
      const response = await fetch("/api/admin/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName,
          capacity: createCapacity,
          location: supportsLocation ? createLocation : undefined,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "No fue posible crear la sala");
      }
      const created = (await response.json()) as RoomSummary & { createdAt?: string | null };
      setRooms((prev) =>
        [...prev, { id: created.id, name: created.name, capacity: created.capacity, location: supportsLocation ? created.location ?? null : null }]
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setSelectedRoomId(created.id);
      setCreating(false);
      setCreateName("");
      setCreateLocation("");
      setCreateCapacity(6);
      await loadRoom(created.id);
    } catch (error: any) {
      console.error(error);
      setCreateError(error?.message ?? "Error al crear la sala");
    } finally {
      setCreateLoading(false);
    }
  };
  const onAddBlock = async () => {
    if (!selectedRoomId) return;
    setBlockSaving(true);
    setFeedback(null);
    try {
      const startIso = combineDateTime(blockStartDate, blockStartTime || "00:00", "00:00");
      const endDate = blockEndDate || blockStartDate;
      const endIso = combineDateTime(endDate, blockEndTime || "23:59", "23:59");
      if (!startIso || !endIso) {
        throw new Error("Debes capturar al menos la fecha de inicio");
      }

      const response = await fetch(`/api/admin/rooms/${selectedRoomId}/blocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startsAt: startIso,
          endsAt: endIso,
          reason: blockReason,
          note: blockNote,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "No fue posible registrar el bloqueo");
      }
      const block = (await response.json()) as RoomDetail["blocks"][number];
      setBlocks((prev) => [block, ...prev].sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1)));
      setBlockStartDate("");
      setBlockEndDate("");
      setBlockStartTime("");
      setBlockEndTime("");
      setBlockReason("mantenimiento");
      setBlockNote("");
      setFeedback({ type: "success", message: "Bloqueo creado" });
    } catch (error: any) {
      console.error(error);
      setFeedback({ type: "error", message: error?.message ?? "Error al crear el bloqueo" });
    } finally {
      setBlockSaving(false);
    }
  };

  const onRemoveBlock = async (blockId: string) => {
    if (!selectedRoomId) return;
    setRemovingBlockId(blockId);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/rooms/${selectedRoomId}/blocks?blockId=${blockId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "No fue posible eliminar el bloqueo");
      }
      setBlocks((prev) => prev.filter((block) => block.id !== blockId));
      setFeedback({ type: "success", message: "Bloqueo eliminado" });
    } catch (error: any) {
      console.error(error);
      setFeedback({ type: "error", message: error?.message ?? "Error al eliminar el bloqueo" });
    } finally {
      setRemovingBlockId(null);
    }
  };

  const onSaveRecurring = async () => {
    if (!selectedRoomId) return;
    setRecurringSaving(true);
    setFeedback(null);
    try {
      const ranges = recurring.flatMap((day) =>
        day.ranges.map((range) => ({
          weekday: day.weekday,
          startTime: range.startTime,
          endTime: range.endTime,
          reason: range.reason,
          note: range.note,
        }))
      );

      const response = await fetch(`/api/admin/rooms/${selectedRoomId}/recurring-blocks`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ranges }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "No fue posible guardar los bloqueos recurrentes");
      }
      const payload = (await response.json()) as RoomDetail["recurringBlocks"];
      setRecurring(groupRecurringResponse(payload));
      setFeedback({ type: "success", message: "Bloqueos recurrentes guardados" });
    } catch (error: any) {
      console.error(error);
      setFeedback({ type: "error", message: error?.message ?? "Error al guardar bloqueos recurrentes" });
    } finally {
      setRecurringSaving(false);
    }
  };
  return (
    <AdminLayout title="Planeacion - Salas" active="planningRooms">
      <Head>
        <title>PilatesTime Admin - Planeacion de salas</title>
      </Head>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[280px,1fr]">
          <div className="rounded-lg border border-slate-200 bg-white">
            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-700">Salas</h2>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                onClick={() => {
                  setCreating((prev) => !prev);
                  setCreateError(null);
                }}
              >
                <span className="material-icons-outlined text-base">add</span>
                Nueva
              </button>
            </header>
            {creating && (
              <div className="space-y-3 border-b border-slate-200 px-4 py-3 text-sm">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Nombre</span>
                  <input
                    className="w-full rounded-md border border-slate-300 px-3 py-2"
                    value={createName}
                    onChange={(event) => setCreateName(event.target.value)}
                  />
                </label>
                {supportsLocation && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Ubicacion</span>
                    <input
                      className="w-full rounded-md border border-slate-300 px-3 py-2"
                      value={createLocation}
                      onChange={(event) => setCreateLocation(event.target.value)}
                    />
                  </label>
                )}
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Capacidad</span>
                  <input
                    type="number"
                    min={1}
                    className="w-full rounded-md border border-slate-300 px-3 py-2"
                    value={createCapacity}
                    onChange={(event) => setCreateCapacity(Number(event.target.value) || 1)}
                  />
                </label>
                {createError && <p className="text-xs text-rose-600">{createError}</p>}
                <div className="flex items-center justify-end gap-2 text-xs">
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 px-3 py-1 text-slate-600"
                    onClick={() => {
                      setCreating(false);
                      setCreateError(null);
                    }}
                    disabled={createLoading}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-indigo-600 px-3 py-1 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                    onClick={onCreateRoom}
                    disabled={createLoading}
                  >
                    {createLoading ? "Creando..." : "Crear"}
                  </button>
                </div>
              </div>
            )}
            <div className="max-h-[420px] overflow-y-auto">
              {rooms.length === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-500">Aun no hay salas registradas.</div>
              ) : (
                <ul className="divide-y divide-slate-200">
                  {rooms.map((room) => {
                    const isActive = room.id === selectedRoomId;
                    return (
                      <li key={room.id}>
                        <button
                          type="button"
                          className={`flex w-full flex-col items-start px-4 py-3 text-left transition ${
                            isActive ? "bg-indigo-50" : "hover:bg-slate-50"
                          }`}
                          onClick={() => onSelectRoom(room.id)}
                        >
                          <span className="text-sm font-medium text-slate-800">{room.name}</span>
                          <span className="text-xs text-slate-500">
                            Capacidad {room.capacity}
                            {supportsLocation && room.location ? ` • ${room.location}` : ""}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {feedback && (
              <div
                className={`rounded-md border px-4 py-3 text-sm ${
                  feedback.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {feedback.message}
              </div>
            )}

            {!selectedRoomId ? (
              <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
                Selecciona o crea una sala para comenzar.
              </div>
            ) : loadingDetail ? (
              <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
                Cargando informacion...
              </div>
            ) : (
              <>
                <section className="rounded-lg border border-slate-200 bg-white">
                  <header className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                    Datos de la sala
                  </header>
                  <div className="grid grid-cols-1 gap-4 px-4 py-4 md:grid-cols-2 lg:grid-cols-3">
                    <label className="block text-sm">
                      <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Nombre</span>
                      <input
                        className="w-full rounded-md border border-slate-300 px-3 py-2"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                      />
                    </label>
                    {supportsLocation && (
                      <label className="block text-sm">
                        <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Ubicacion</span>
                        <input
                          className="w-full rounded-md border border-slate-300 px-3 py-2"
                          value={location}
                          onChange={(event) => setLocation(event.target.value)}
                        />
                      </label>
                    )}
                    <label className="block text-sm">
                      <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Capacidad</span>
                      <input
                        type="number"
                        min={1}
                        className="w-full rounded-md border border-slate-300 px-3 py-2"
                        value={capacity}
                        onChange={(event) => setCapacity(Number(event.target.value) || 1)}
                      />
                    </label>
                  </div>
                </section>

                {apparatusSupported && (
                  <section className="rounded-lg border border-slate-200 bg-white">
                    <header className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                      Aparatos y recursos
                    </header>
                    <div className="space-y-4 px-4 py-4">
                      <AparatosLista lines={apparatusLines} options={apparatus} onChange={updateApparatusLine} onRemove={removeApparatusLine} />
                      <button
                        type="button"
                        className="text-sm font-medium text-indigo-600 hover:underline"
                        onClick={addApparatusLine}
                      >
                        + Agregar aparato o recurso
                      </button>
                    </div>
                  </section>
                )}

                <section className="rounded-lg border border-slate-200 bg-white">
                  <div className="flex items-center gap-2 border-b border-slate-200 px-4 pt-4">
                    <div className="inline-flex rounded-md border border-slate-200 p-0.5">
                      <button
                        type="button"
                        className={`px-4 py-2 text-sm font-medium ${
                          tab === "fecha" ? "rounded-md bg-indigo-50 text-indigo-700" : "text-slate-600"
                        }`}
                        onClick={() => setTab("fecha")}
                      >
                        Bloqueos por fecha
                      </button>
                      <button
                        type="button"
                        className={`px-4 py-2 text-sm font-medium ${
                          tab === "recurrente" ? "rounded-md bg-indigo-50 text-indigo-700" : "text-slate-600"
                        }`}
                        onClick={() => setTab("recurrente")}
                      >
                        Bloqueos recurrentes
                      </button>
                    </div>
                  </div>

                  {tab === "fecha" ? (
                    <div className="space-y-4 px-4 py-4">
                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr),minmax(0,1fr),auto]">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <label className="block text-sm">
                            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Fecha inicio</span>
                            <input
                              type="date"
                              className="w-full rounded-md border border-slate-300 px-3 py-2"
                              value={blockStartDate}
                              onChange={(event) => setBlockStartDate(event.target.value)}
                            />
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Fecha fin</span>
                            <input
                              type="date"
                              className="w-full rounded-md border border-slate-300 px-3 py-2"
                              value={blockEndDate}
                              onChange={(event) => setBlockEndDate(event.target.value)}
                            />
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Hora inicio</span>
                            <input
                              type="time"
                              className="w-full rounded-md border border-slate-300 px-3 py-2"
                              value={blockStartTime}
                              onChange={(event) => setBlockStartTime(event.target.value)}
                            />
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Hora fin</span>
                            <input
                              type="time"
                              className="w-full rounded-md border border-slate-300 px-3 py-2"
                              value={blockEndTime}
                              onChange={(event) => setBlockEndTime(event.target.value)}
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <label className="block text-sm">
                            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Motivo</span>
                            <select
                              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                              value={blockReason}
                              onChange={(event) => setBlockReason(event.target.value as BlockReason)}
                            >
                              {REASON_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Nota</span>
                            <input
                              className="w-full rounded-md border border-slate-300 px-3 py-2"
                              placeholder="Opcional"
                              value={blockNote}
                              onChange={(event) => setBlockNote(event.target.value)}
                            />
                          </label>
                        </div>

                        <button
                          type="button"
                          className="h-12 self-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                          onClick={onAddBlock}
                          disabled={blockSaving}
                        >
                          {blockSaving ? "Guardando..." : "Agregar bloqueo"}
                        </button>
                      </div>

                      <div>
                        <h4 className="mb-2 text-sm font-semibold text-slate-700">Bloqueos creados</h4>
                        {blocks.length === 0 ? (
                          <p className="text-sm text-slate-500">Aun no hay bloqueos registrados.</p>
                        ) : (
                          <ul className="space-y-2">
                            {blocks.map((block) => (
                              <li key={block.id} className="flex items-start justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
                                <div>
                                  <p className="text-sm font-medium text-slate-700">{formatRangeLabel(block.startsAt, block.endsAt)}</p>
                                  <p className="text-xs text-slate-500">{findReasonLabel(block.reason)}</p>
                                  {block.note ? (
                                    <p className="text-xs text-slate-500">Nota: {block.note}</p>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  className="rounded-md p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-60"
                                  onClick={() => onRemoveBlock(block.id)}
                                  disabled={removingBlockId === block.id}
                                >
                                  <span className="material-icons-outlined">delete</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 px-4 py-4">
                      <p className="text-sm text-slate-500">
                        Define bloqueos semanales recurrentes (por ejemplo, mantenimiento cada lunes de 14:00 a 16:00).
                      </p>
                      <div className="space-y-3">
                        {recurring.map((day) => (
                          <RecurringDayEditor
                            key={day.weekday}
                            day={day}
                            onChange={(next) =>
                              setRecurring((prev) => prev.map((item) => (item.weekday === next.weekday ? next : item)))
                            }
                          />
                        ))}
                      </div>
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                          onClick={onSaveRecurring}
                          disabled={recurringSaving}
                        >
                          {recurringSaving ? "Guardando..." : "Guardar bloqueos"}
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-60"
                    onClick={onCancelRoom}
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                    onClick={onSaveRoom}
                    disabled={saving}
                  >
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}

