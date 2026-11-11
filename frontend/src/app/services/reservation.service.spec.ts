import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ReservationService } from './reservation.service';

describe('ReservationService', () => {
  let service: ReservationService;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.setItem('nova_token', 'token-de-prueba');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ReservationService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.removeItem('nova_token');
  });

  it('envía el CRUD con JWT a la API de reservas', () => {
    const input = { service: 'masaje' as const, scheduledAt: '2030-01-01T15:00:00.000Z', notes: 'Tarde' };
    const endpoint = '/api/reservations';
    const check = (method: string, url: string) => {
      const request = http.expectOne(url);
      expect(request.request.method).toBe(method);
      expect(request.request.headers.get('Authorization')).toBe('Bearer token-de-prueba');
      return request;
    };

    service.create(input).subscribe();
    const created = check('POST', endpoint);
    expect(created.request.body).toEqual(input);
    created.flush({ reservation: { _id: 'id-1', ...input, status: 'pendiente' } });

    service.list().subscribe();
    check('GET', endpoint).flush({ reservations: [] });

    service.get('id-1').subscribe();
    check('GET', `${endpoint}/id-1`).flush({ reservation: { _id: 'id-1', ...input } });

    service.update('id-1', input).subscribe();
    const updated = check('PUT', `${endpoint}/id-1`);
    expect(updated.request.body).toEqual(input);
    updated.flush({ reservation: { _id: 'id-1', ...input } });

    service.remove('id-1').subscribe();
    check('DELETE', `${endpoint}/id-1`).flush(null, { status: 204, statusText: 'No Content' });
  });
});
