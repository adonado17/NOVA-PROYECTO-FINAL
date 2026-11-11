# NOVA Studio

Proyecto del Bootcamp en Desarrollo Web. NOVA Studio presenta servicios de bienestar y estética. El frontend principal está construido con Angular y TypeScript; la API usa Express y MongoDB Atlas.

## Funciones actuales

- Portada responsive con información del negocio, servicios, beneficios y contacto.
- Registro e inicio de sesión en páginas Angular distintas.
- Perfil protegido con JWT y cierre de sesión.
- CRUD de solicitudes de cita: crear, consultar, editar y eliminar las propias solicitudes.
- URL de API centralizada en `frontend/src/app/utils/api.ts`.

Las solicitudes de cita quedan pendientes de confirmación. La gestión administrativa de servicios y la confirmación de disponibilidad aún no están implementadas.

## Estructura

```text
NOVA-PROYECTO-FINAL/
├── frontend/               # Aplicación Angular
│   ├── src/app/pages/      # Portada, cuenta y solicitudes de cita
│   ├── src/app/services/   # Peticiones HTTP de autenticación y citas
│   ├── src/app/guards/     # Protección de rutas
│   ├── src/app/interfaces/ # Tipos de datos
│   ├── src/app/shared/     # Navegación reutilizable
│   └── src/app/utils/      # URL de la API y errores
├── backend/                # API Express, MongoDB y pruebas
├── docs/                   # Cobertura de los temas del curso
└── index.html, css/, src/  # Versión HTML/TypeScript anterior
```

La versión HTML anterior queda como alternativa cuando aún no se ha compilado Angular. Tras compilar `frontend/`, Express sirve la aplicación Angular en `http://localhost:3000`.

## Instalación y ejecución

Desde la raíz del repositorio:

```powershell
npm ci
npm --prefix frontend ci
npm --prefix backend ci
Copy-Item backend/.env.example backend/.env
```

Configura `MONGODB_URI` y un `JWT_SECRET` de al menos 32 caracteres en `backend/.env`. El archivo es privado y está excluido de Git. Después:

```powershell
npm run build
npm --prefix backend start
```

Abre `http://localhost:3000`. El registro está en `/register`, el inicio de sesión en `/login`, el perfil en `/profile` y las solicitudes en `/reservations`. Las direcciones antiguas `.html` redirigen a estas rutas cuando Angular está compilado.

Para trabajar con recarga automática, ejecuta el backend en un terminal y `npm --prefix frontend start` en otro. Abre `http://localhost:4200`; el proxy de `frontend/proxy.conf.json` envía `/api` al backend en el puerto 3000.

## Pruebas y API

`npm test` compila Angular y ejecuta las pruebas del backend y del frontend. Además de salud y autenticación, la API ofrece `GET`, `POST`, `PUT` y `DELETE` en `/api/reservations`; las rutas de citas requieren un token Bearer.

La colección de Postman y los detalles del servidor están en [backend/README.md](backend/README.md). La relación con el curso está en [docs/COBERTURA_Q10.md](docs/COBERTURA_Q10.md).
