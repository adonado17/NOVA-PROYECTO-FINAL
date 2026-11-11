import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { apiErrorMessage } from '../../utils/api';

@Component({
  selector: 'app-profile',
  imports: [RouterLink],
  templateUrl: './profile.component.html',
})
export class ProfileComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly loading = signal(true);
  readonly error = signal('');

  ngOnInit(): void {
    this.auth.profile().subscribe({
      next: () => { this.loading.set(false); },
      error: (error: unknown) => {
        this.loading.set(false);
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.auth.logout();
          void this.router.navigateByUrl('/login');
          return;
        }
        this.error.set(apiErrorMessage(error));
      },
    });
  }
}
