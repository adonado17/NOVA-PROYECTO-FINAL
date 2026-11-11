import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ReservationInput, ReservationListResponse, ReservationResponse } from '../interfaces/reservation';
import { apiUrl } from '../utils/api';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ReservationService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly endpoint = `${apiUrl}/reservations`;

  list(): Observable<ReservationListResponse> {
    return this.http.get<ReservationListResponse>(this.endpoint, { headers: this.auth.authorizationHeaders() });
  }

  get(id: string): Observable<ReservationResponse> {
    return this.http.get<ReservationResponse>(`${this.endpoint}/${id}`, { headers: this.auth.authorizationHeaders() });
  }

  create(input: ReservationInput): Observable<ReservationResponse> {
    return this.http.post<ReservationResponse>(this.endpoint, input, { headers: this.auth.authorizationHeaders() });
  }

  update(id: string, input: ReservationInput): Observable<ReservationResponse> {
    return this.http.put<ReservationResponse>(`${this.endpoint}/${id}`, input, { headers: this.auth.authorizationHeaders() });
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.endpoint}/${id}`, { headers: this.auth.authorizationHeaders() });
  }
}
