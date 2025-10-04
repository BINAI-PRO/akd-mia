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
