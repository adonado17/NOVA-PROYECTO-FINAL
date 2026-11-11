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

type AuthRoute = 'register' | 'login';
type JsonObject = Record<string, unknown>;

const apiUrl = '/api';
const tokenKey = 'nova_token';
const statusMessage = document.querySelector<HTMLElement>('#auth-status');
const registerForm = document.querySelector<HTMLFormElement>('#register-form');
const loginForm = document.querySelector<HTMLFormElement>('#login-form');
const profile = document.querySelector<HTMLElement>('#account-profile');

class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

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
  if (!statusMessage) return;
  statusMessage.textContent = message;
  statusMessage.dataset.error = String(isError);
  statusMessage.hidden = message.length === 0;
}

async function apiRequest<T>(
  path: string,
  validate: (value: unknown) => value is T,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
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
  if (route === 'register') values.name = String(data.get('name') ?? '');
  return values;
}

async function submitAuth(form: HTMLFormElement, route: AuthRoute): Promise<void> {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!button) return;
  button.disabled = true;
  showStatus('Procesando solicitud…');

  try {
    const data = await apiRequest(`/auth/${route}`, isAuthResponse, {
      method: 'POST',
      body: JSON.stringify(formValues(form, route)),
    });
    sessionStorage.setItem(tokenKey, data.token);
    window.location.assign('perfil.html');
  } catch (error: unknown) {
    const message = error instanceof TypeError
      ? 'No se pudo conectar con el servidor.'
      : error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
    showStatus(message, true);
    button.disabled = false;
  }
}

registerForm?.addEventListener('submit', (event: SubmitEvent) => {
  event.preventDefault();
  void submitAuth(registerForm, 'register');
});

loginForm?.addEventListener('submit', (event: SubmitEvent) => {
  event.preventDefault();
  void submitAuth(loginForm, 'login');
});

document.querySelector<HTMLButtonElement>('#logout-button')?.addEventListener('click', () => {
  sessionStorage.removeItem(tokenKey);
  window.location.assign('iniciar-sesion.html');
});

async function restoreSession(): Promise<void> {
  if (!profile) return;
  const token = sessionStorage.getItem(tokenKey);
  if (!token) {
    window.location.replace('iniciar-sesion.html');
    return;
  }

  showStatus('Cargando perfil…');
  try {
    const data = await apiRequest('/auth/me', isProfileResponse, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const name = document.querySelector<HTMLElement>('#profile-name');
    const email = document.querySelector<HTMLElement>('#profile-email');
    if (name) name.textContent = data.user.name;
    if (email) email.textContent = data.user.email;
    profile.hidden = false;
    showStatus('');
  } catch (error: unknown) {
    if (error instanceof ApiRequestError && error.status === 401) {
      sessionStorage.removeItem(tokenKey);
      window.location.replace('iniciar-sesion.html');
      return;
    }
    showStatus('No se pudo recuperar el perfil. Inténtalo de nuevo.', true);
  }
}

void restoreSession();
