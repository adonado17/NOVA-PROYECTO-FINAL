# NOVA Studio

Proyecto final del Bootcamp en Desarrollo Web. Incluye el sitio responsive de NOVA Studio y un flujo de autenticación conectado al backend. El código del navegador se escribe en TypeScript y se compila a JavaScript.

## Idea de negocio

NOVA Studio es una propuesta de centro de bienestar y estética enfocada en servicios de cuidado facial, corporal y relajación dentro de un ambiente tranquilo y cómodo.

## Objetivo

Desarrollar una página web responsive que presente la idea de negocio, sus principales servicios, beneficios y medios de contacto.

## Tecnologías utilizadas

- HTML5
- CSS3
- Flexbox
- CSS Grid
- Media queries
- TypeScript, JavaScript y Fetch API
- Node.js, Express y MongoDB Atlas

## Secciones del sitio

1. Barra de navegación
2. Hero principal
3. Nosotros
4. Servicios
5. Beneficios
6. Mi cuenta: registro, inicio de sesión y perfil
7. Contacto
8. Footer

## Estructura del proyecto

```text
NOVA-PROYECTO-FINAL/
├── index.html
├── README.md
├── .gitignore
├── css/
│   └── styles.css
├── img/
│   └── favicon.svg
├── src/
│   └── auth.ts
├── js/
│   ├── auth.js
│   └── auth.js.map
├── docs/
│   └── COBERTURA_Q10.md
├── package.json
├── package-lock.json
├── tsconfig.json
└── backend/
    ├── src/
    ├── test/
    ├── postman/
    ├── package.json
    └── README.md
```

## Cómo ejecutar NOVA

El frontend y la API se sirven desde Express en el mismo origen. En la raíz instala TypeScript con `npm ci` y compila el frontend con `npm run build`. En `backend/`, instala las dependencias con `npm ci`, copia `.env.example` a `.env` y configura `MONGODB_URI` y `JWT_SECRET` como indica [`backend/README.md`](backend/README.md). Ejecuta `npm start` desde `backend/` y abre `http://localhost:3000` en el navegador. Abrir `index.html` como archivo local no permite usar la autenticación.

## Backend de autenticación

La carpeta [`backend/`](backend/) contiene una API con Express y MongoDB Atlas. Permite registrar clientes, iniciar sesión y consultar el perfil mediante un token JWT. La sección «Mi cuenta» del frontend usa estas rutas para registrar, iniciar sesión, mostrar el perfil y cerrar sesión. El token se guarda en `sessionStorage` hasta que se cierre la pestaña o se cierre la sesión.

Para ejecutarla desde `backend/`:

```powershell
npm ci
Copy-Item .env.example .env
```

Configura `MONGODB_URI` y un `JWT_SECRET` de al menos 32 caracteres en `.env`. Ese archivo es privado y está excluido de Git. Después:

```powershell
npm start
npm test
```

Endpoints disponibles: `GET /api/health`, `POST /api/auth/register`, `POST /api/auth/login` y `GET /api/auth/me`. La documentación, colección de Postman y pruebas están en [`backend/README.md`](backend/README.md).

## TypeScript y revisión del curso

Edita `src/auth.ts` y ejecuta `npm run build` para generar `js/auth.js` y su mapa de origen. `npm run check` verifica los tipos sin generar archivos; `npm test` compila el frontend y ejecuta las pruebas del backend. El JavaScript compilado está incluido para que el repositorio funcione después de instalar y configurar el backend.

La matriz de [cobertura de Q10](docs/COBERTURA_Q10.md) indica qué temas hasta TypeScript se usan en NOVA y cuáles no forman parte de esta implementación. El formulario de contacto todavía no envía solicitudes; los servicios y las reservas solo se presentan como contenido del sitio.
