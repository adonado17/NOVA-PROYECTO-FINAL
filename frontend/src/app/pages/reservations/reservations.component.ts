import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Reservation, ReservationInput, isServiceId, serviceLabel, serviceOptions } from '../../interfaces/reservation';
import { AuthService } from '../../services/auth.service';
import { ReservationService } from '../../services/reservation.service';
import { apiErrorMessage } from '../../utils/api';

@Component({
  selector: 'app-reservations',
  imports: [DatePipe, ReactiveFormsModule],
  templateUrl: './reservations.component.html',
  styleUrl: './reservations.component.css',
})
export class ReservationsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly reservationsApi = inject(ReservationService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly serviceOptions = serviceOptions;
  readonly serviceLabel = serviceLabel;
  readonly reservations = signal<Reservation[]>([]);
  readonly selected = signal<Reservation | null>(null);
  readonly editingId = signal<string | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly form = this.fb.nonNullable.group({
    service: ['', Validators.required],
    scheduledAt: ['', Validators.required],
    notes: ['', Validators.maxLength(500)],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.reservationsApi.list().subscribe({
      next: ({ reservations }) => {
        this.reservations.set(reservations);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.handleError(error);
      },
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revisa los campos de la solicitud.');
      return;
    }
    const values = this.form.getRawValue();
    const date = new Date(values.scheduledAt);
    if (!isServiceId(values.service) || !Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
      this.error.set('Selecciona un servicio y una fecha futura.');
      return;
    }
    const input: ReservationInput = {
      service: values.service,
      scheduledAt: date.toISOString(),
      notes: values.notes.trim(),
    };
    const id = this.editingId();
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    const request = id ? this.reservationsApi.update(id, input) : this.reservationsApi.create(input);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.notice.set(id ? 'Solicitud actualizada.' : 'Solicitud de cita creada. Está pendiente de confirmación.');
        this.cancelEdit();
        this.load();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.handleError(error);
      },
    });
  }

  edit(reservation: Reservation): void {
    this.editingId.set(reservation._id);
    this.form.setValue({
      service: reservation.service,
      scheduledAt: this.toLocalInput(reservation.scheduledAt),
      notes: reservation.notes ?? '',
    });
    this.error.set('');
    this.notice.set('');
    document.getElementById('reservation-form')?.scrollIntoView({ behavior: 'smooth' });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.form.reset({ service: '', scheduledAt: '', notes: '' });
  }

  showDetails(id: string): void {
    this.reservationsApi.get(id).subscribe({
      next: ({ reservation }) => this.selected.set(reservation),
      error: (error: unknown) => this.handleError(error),
    });
  }

  closeDetails(): void {
    this.selected.set(null);
  }

  remove(reservation: Reservation): void {
    if (!window.confirm('¿Eliminar esta solicitud de cita?')) return;
    this.busy.set(true);
    this.error.set('');
    this.reservationsApi.remove(reservation._id).subscribe({
      next: () => {
        this.busy.set(false);
        this.notice.set('Solicitud eliminada.');
        if (this.editingId() === reservation._id) this.cancelEdit();
        this.selected.set(null);
        this.load();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.handleError(error);
      },
    });
  }

  private handleError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 401) {
      this.auth.logout();
      void this.router.navigateByUrl('/login');
      return;
    }
    this.error.set(apiErrorMessage(error));
  }

  private toLocalInput(value: string): string {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }
}
