export const serviceOptions = [
  { id: 'limpieza', label: 'Limpieza facial' },
  { id: 'hidratacion', label: 'Hidratación facial' },
  { id: 'masaje', label: 'Masaje relajante' },
  { id: 'corporal', label: 'Cuidado corporal' },
] as const;

export type ServiceId = typeof serviceOptions[number]['id'];

export interface ReservationInput {
  service: ServiceId;
  scheduledAt: string;
  notes: string;
}

export interface Reservation extends ReservationInput {
  _id: string;
  status: 'pendiente';
  createdAt: string;
  updatedAt: string;
}

export interface ReservationResponse {
  reservation: Reservation;
}

export interface ReservationListResponse {
  reservations: Reservation[];
}

export function isServiceId(value: string): value is ServiceId {
  return serviceOptions.some((option) => option.id === value);
}

export function serviceLabel(value: string): string {
  return serviceOptions.find((option) => option.id === value)?.label ?? value;
}
