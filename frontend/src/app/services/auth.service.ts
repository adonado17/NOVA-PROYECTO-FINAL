import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { AuthResponse, AuthUser, LoginInput, ProfileResponse, RegisterInput } from '../interfaces/user';
import { apiUrl } from '../utils/api';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenKey = 'nova_token';
  readonly user = signal<AuthUser | null>(null);
  readonly authenticated = signal(this.hasToken());

  register(input: RegisterInput): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${apiUrl}/auth/register`, input)
      .pipe(tap((response) => this.saveSession(response)));
  }

  login(input: LoginInput): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${apiUrl}/auth/login`, input)
      .pipe(tap((response) => this.saveSession(response)));
  }

  profile(): Observable<ProfileResponse> {
    return this.http.get<ProfileResponse>(`${apiUrl}/auth/me`, { headers: this.authorizationHeaders() })
      .pipe(tap((response) => this.user.set(response.user)));
  }

  authorizationHeaders(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.token() ?? ''}` });
  }

  hasToken(): boolean {
    return this.token() !== null;
  }

  logout(): void {
    sessionStorage.removeItem(this.tokenKey);
    this.user.set(null);
    this.authenticated.set(false);
  }

  private token(): string | null {
    return sessionStorage.getItem(this.tokenKey);
  }

  private saveSession(response: AuthResponse): void {
    sessionStorage.setItem(this.tokenKey, response.token);
    this.user.set(response.user);
    this.authenticated.set(true);
  }
}
