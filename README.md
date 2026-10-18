# NOVA Studio

Proyecto final del Módulo I de HTML y CSS.

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

## Secciones del sitio

1. Barra de navegación
2. Hero principal
3. Nosotros
4. Servicios
5. Beneficios
6. Contacto
7. Footer

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
└── backend/
    ├── src/
    ├── test/
    ├── postman/
    ├── package.json
    └── README.md
```

## Cómo visualizar el frontend

Clonar o descargar el repositorio y abrir el archivo `index.html` en el navegador.

## Backend de autenticación

La carpeta [`backend/`](backend/) contiene una API con Express y MongoDB Atlas. Permite registrar clientes, iniciar sesión y consultar el perfil mediante un token JWT. El frontend HTML/CSS todavía no consume esta API.

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

## Autor

Andres. El backend se integró con asistencia de Codex a partir de un proyecto de práctica; el historial de Git refleja esta integración, no una escritura manual previa.
