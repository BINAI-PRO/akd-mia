export type CalendarFilterOption = {
  id: string;
  label: string;
};

export type CalendarSession = {
  id: string;
  startISO: string;
  endISO: string;
  title: string;
  classTypeId: string | null;
  classTypeName: string | null;
  instructorId: string | null;
  instructorName: string | null;
  roomId: string | null;
  roomName: string | null;
  capacity: number;
  occupancy: number;
};

export type MiniCalendarDay = {
  isoDate: string;
  label: string;
  isCurrentMonth: boolean;
  isSelected: boolean;
};

export type CalendarSessionRow = {
  id: string;
  start_time: string;
  end_time: string;
  capacity: number | null;
  current_occupancy: number | null;
  class_type_id: string | null;
  instructor_id: string | null;
  room_id: string | null;
  class_types: { id: string; name: string } | null;
  instructors: { id: string; full_name: string } | null;
  rooms: { id: string; name: string } | null;
};

