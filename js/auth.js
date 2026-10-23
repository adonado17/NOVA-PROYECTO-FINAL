"use strict";
class ApiRequestError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = 'ApiRequestError';
    }
}
function requiredElement(selector) {
    const element = document.querySelector(selector);
    if (!element)
        throw new Error(`Falta el elemento ${selector}.`);
    return element;
}
const registerForm = requiredElement('#register-form');
const loginForm = requiredElement('#login-form');
const authForms = requiredElement('#auth-forms');
const profile = requiredElement('#account-profile');
const statusMessage = requiredElement('#auth-status');
const logoutButton = requiredElement('#logout-button');
const profileName = requiredElement('#profile-name');
const profileEmail = requiredElement('#profile-email');
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
    statusMessage.textContent = message;
    statusMessage.dataset.error = String(isError);
    statusMessage.hidden = message.length === 0;
}
function showProfile(user) {
    profileName.textContent = user.name;
    profileEmail.textContent = user.email;
    authForms.hidden = true;
    profile.hidden = false;
}
function showForms() {
    profile.hidden = true;
    authForms.hidden = false;
}
async function apiRequest(path, validate, options = {}) {
    const response = await fetch(path, {
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
    if (route === '/api/auth/register')
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
        const data = await apiRequest(route, isAuthResponse, {
            method: 'POST',
            body: JSON.stringify(formValues(form, route)),
        });
        sessionStorage.setItem('nova_token', data.token);
        form.reset();
        showProfile(data.user);
        showStatus(route === '/api/auth/register' ? 'Cuenta creada correctamente.' : 'Sesión iniciada.');
    }
    catch (error) {
        const message = error instanceof TypeError
            ? 'No se pudo conectar con el servidor.'
            : error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
        showStatus(message, true);
    }
    finally {
        button.disabled = false;
    }
}
registerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitAuth(registerForm, '/api/auth/register');
});
loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitAuth(loginForm, '/api/auth/login');
});
logoutButton.addEventListener('click', () => {
    sessionStorage.removeItem('nova_token');
    showForms();
    showStatus('Sesión cerrada.');
});
async function restoreSession() {
    const token = sessionStorage.getItem('nova_token');
    if (!token)
        return;
    try {
        const data = await apiRequest('/api/auth/me', isProfileResponse, {
            headers: { Authorization: `Bearer ${token}` },
        });
        showProfile(data.user);
    }
    catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) {
            sessionStorage.removeItem('nova_token');
            showForms();
            return;
        }
        showStatus('No se pudo recuperar la sesión. Inténtalo de nuevo.', true);
    }
}
void restoreSession();
//# sourceMappingURL=auth.js.map