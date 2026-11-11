# Frontend de NOVA Studio

Aplicación Angular y TypeScript con portada, registro, inicio de sesión y perfil. La organización usa páginas, servicio HTTP, guard, interfaces, navegación compartida y URL central de la API.

## Desarrollo

Inicia primero el backend en el puerto 3000. Desde la raíz del repositorio ejecuta:

```powershell
npm --prefix frontend ci
npm --prefix frontend start
```

Abre `http://localhost:4200`. El proxy de `proxy.conf.json` dirige las solicitudes `/api` al backend, de modo que el código utiliza la misma URL base en desarrollo y en la versión compilada.

## Compilación

```powershell
npm --prefix frontend run build
```

El resultado se guarda en `frontend/dist/frontend/browser`. Express sirve esa compilación en `http://localhost:3000` cuando existe.

## Rutas

| Ruta | Página |
| --- | --- |
| `/` | Portada |
| `/register` | Crear cuenta |
| `/login` | Iniciar sesión |
| `/profile` | Perfil protegido |

La API conserva los endpoints existentes de NOVA; el ejemplo de tareas del profesor se usó como referencia de estructura, sin incorporarlo como función del negocio.
