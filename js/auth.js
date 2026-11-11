"use strict";
const apiUrl = '/api';
const tokenKey = 'nova_token';
const statusMessage = document.querySelector('#auth-status');
const registerForm = document.querySelector('#register-form');
const loginForm = document.querySelector('#login-form');
const profile = document.querySelector('#account-profile');
class ApiRequestError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = 'ApiRequestError';
    }
}
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isUser(value) {
    return isObject(value)
        && typeof value.id === 'string'
        && typeof value.name === 'string'
        && typeof value.email === 'string';
}
function isAuthResponse(value) {
    return isObject(value) && typeof value.token === 'string' && isUser(value.user);
}
function isProfileResponse(value) {
    return isObject(value) && isUser(value.user);
}
function errorMessage(value) {
    if (!isObject(value))
        return 'No se pudo completar la solicitud.';
    if (Array.isArray(value.errors)) {
        const messages = value.errors
            .filter((item) => isObject(item))
            .map((item) => item.message)
            .filter((message) => typeof message === 'string');
        if (messages.length > 0)
            return messages.join(' ');
    }
    return typeof value.message === 'string' ? value.message : 'No se pudo completar la solicitud.';
}
function showStatus(message, isError = false) {
    if (!statusMessage)
        return;
    statusMessage.textContent = message;
    statusMessage.dataset.error = String(isError);
    statusMessage.hidden = message.length === 0;
}
async function apiRequest(path, validate, options = {}) {
    const response = await fetch(`${apiUrl}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    let data;
    try {
        data = await response.json();
    }
    catch {
        throw new Error('El servidor devolvió una respuesta inválida.');
    }
    if (!response.ok)
        throw new ApiRequestError(errorMessage(data), response.status);
    if (!validate(data))
        throw new Error('El servidor devolvió datos incompletos.');
    return data;
}
function formValues(form, route) {
    const data = new FormData(form);
    const values = {
        email: String(data.get('email') ?? ''),
        password: String(data.get('password') ?? ''),
    };
    if (route === 'register')
        values.name = String(data.get('name') ?? '');
    return values;
}
async function submitAuth(form, route) {
    const button = form.querySelector('button[type="submit"]');
    if (!button)
        return;
    button.disabled = true;
    showStatus('Procesando solicitud…');
    try {
        const data = await apiRequest(`/auth/${route}`, isAuthResponse, {
            method: 'POST',
            body: JSON.stringify(formValues(form, route)),
        });
        sessionStorage.setItem(tokenKey, data.token);
        window.location.assign('perfil.html');
    }
    catch (error) {
        const message = error instanceof TypeError
            ? 'No se pudo conectar con el servidor.'
            : error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
        showStatus(message, true);
        button.disabled = false;
    }
}
registerForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitAuth(registerForm, 'register');
});
loginForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitAuth(loginForm, 'login');
});
document.querySelector('#logout-button')?.addEventListener('click', () => {
    sessionStorage.removeItem(tokenKey);
    window.location.assign('iniciar-sesion.html');
});
async function restoreSession() {
    if (!profile)
        return;
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
        const name = document.querySelector('#profile-name');
        const email = document.querySelector('#profile-email');
        if (name)
            name.textContent = data.user.name;
        if (email)
            email.textContent = data.user.email;
        profile.hidden = false;
        showStatus('');
    }
    catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) {
            sessionStorage.removeItem(tokenKey);
            window.location.replace('iniciar-sesion.html');
            return;
        }
        showStatus('No se pudo recuperar el perfil. Inténtalo de nuevo.', true);
    }
}
void restoreSession();
//# sourceMappingURL=auth.js.map