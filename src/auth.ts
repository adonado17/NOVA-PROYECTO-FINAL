interface AuthUser {
  id: string;
  name: string;
  email: string;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

interface ProfileResponse {
  user: AuthUser;
}

type AuthRoute = '/api/auth/register' | '/api/auth/login';

type JsonObject = Record<string, unknown>;

class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Falta el elemento ${selector}.`);
  return element;
}

const registerForm = requiredElement<HTMLFormElement>('#register-form');
const loginForm = requiredElement<HTMLFormElement>('#login-form');
const authForms = requiredElement<HTMLElement>('#auth-forms');
const profile = requiredElement<HTMLElement>('#account-profile');
const statusMessage = requiredElement<HTMLElement>('#auth-status');
const logoutButton = requiredElement<HTMLButtonElement>('#logout-button');
const profileName = requiredElement<HTMLElement>('#profile-name');
const profileEmail = requiredElement<HTMLElement>('#profile-email');

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUser(value: unknown): value is AuthUser {
  return isObject(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.email === 'string';
}

function isAuthResponse(value: unknown): value is AuthResponse {
  return isObject(value) && typeof value.token === 'string' && isUser(value.user);
}

function isProfileResponse(value: unknown): value is ProfileResponse {
  return isObject(value) && isUser(value.user);
}

function errorMessage(value: unknown): string {
  if (!isObject(value)) return 'No se pudo completar la solicitud.';
  if (Array.isArray(value.errors)) {
    const messages = value.errors
      .filter((item): item is JsonObject => isObject(item))
      .map((item) => item.message)
      .filter((message): message is string => typeof message === 'string');
    if (messages.length > 0) return messages.join(' ');
  }
  return typeof value.message === 'string' ? value.message : 'No se pudo completar la solicitud.';
}

function showStatus(message: string, isError = false): void {
  statusMessage.textContent = message;
  statusMessage.dataset.error = String(isError);
  statusMessage.hidden = message.length === 0;
}

function showProfile(user: AuthUser): void {
  profileName.textContent = user.name;
  profileEmail.textContent = user.email;
  authForms.hidden = true;
  profile.hidden = false;
}

function showForms(): void {
  profile.hidden = true;
  authForms.hidden = false;
}

async function apiRequest<T>(
  path: string,
  validate: (value: unknown) => value is T,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error('El servidor devolvió una respuesta inválida.');
  }

  if (!response.ok) throw new ApiRequestError(errorMessage(data), response.status);
  if (!validate(data)) throw new Error('El servidor devolvió datos incompletos.');
  return data;
}

function formValues(form: HTMLFormElement, route: AuthRoute): JsonObject {
  const data = new FormData(form);
  const values: JsonObject = {
    email: String(data.get('email') ?? ''),
    password: String(data.get('password') ?? ''),
  };
  if (route === '/api/auth/register') values.name = String(data.get('name') ?? '');
  return values;
}

async function submitAuth(form: HTMLFormElement, route: AuthRoute): Promise<void> {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!button) return;
  button.disabled = true;
  showStatus('Procesando solicitud…');

  try {
    const data = await apiRequest(route, isAuthResponse, {
      method: 'POST',
      body: JSON.stringify(formValues(form, route)),
    });
    sessionStorage.setItem('nova_token', data.token);
    form.reset();
    showProfile(data.user);
    showStatus(route === '/api/auth/register' ? 'Cuenta creada correctamente.' : 'Sesión iniciada.');
  } catch (error: unknown) {
    const message = error instanceof TypeError
      ? 'No se pudo conectar con el servidor.'
      : error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
    showStatus(message, true);
  } finally {
    button.disabled = false;
  }
}

registerForm.addEventListener('submit', (event: SubmitEvent) => {
  event.preventDefault();
  void submitAuth(registerForm, '/api/auth/register');
});

loginForm.addEventListener('submit', (event: SubmitEvent) => {
  event.preventDefault();
  void submitAuth(loginForm, '/api/auth/login');
});

logoutButton.addEventListener('click', () => {
  sessionStorage.removeItem('nova_token');
  showForms();
  showStatus('Sesión cerrada.');
});

async function restoreSession(): Promise<void> {
  const token = sessionStorage.getItem('nova_token');
  if (!token) return;

  try {
    const data = await apiRequest('/api/auth/me', isProfileResponse, {
      headers: { Authorization: `Bearer ${token}` },
    });
    showProfile(data.user);
  } catch (error: unknown) {
    if (error instanceof ApiRequestError && error.status === 401) {
      sessionStorage.removeItem('nova_token');
      showForms();
      return;
    }
    showStatus('No se pudo recuperar la sesión. Inténtalo de nuevo.', true);
  }
}

void restoreSession();
