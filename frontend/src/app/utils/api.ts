import { HttpErrorResponse } from '@angular/common/http';

export const apiUrl = '/api';

export function apiErrorMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) return 'Ocurrió un error inesperado.';
  if (error.status === 0) return 'No se pudo conectar con el servidor.';

  const body = error.error as { message?: unknown; errors?: Array<{ message?: unknown }> } | null;
  if (Array.isArray(body?.errors)) {
    const messages = body.errors
      .map((item) => item.message)
      .filter((message): message is string => typeof message === 'string');
    if (messages.length > 0) return messages.join(' ');
  }
  return typeof body?.message === 'string' ? body.message : 'No se pudo completar la solicitud.';
}
