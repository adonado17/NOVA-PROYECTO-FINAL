# NOVA Studio - API de cuentas y citas

Esta API de Node.js está integrada en el repositorio de NOVA Studio. Atiende al frontend Angular y conserva una versión HTML de respaldo. Incluye autenticación de clientes y conexión con MongoDB Atlas.

## Qué hace

- Conecta Express a MongoDB Atlas mediante Mongoose.
- Registra usuarios con nombre, correo y contraseña.
- Valida los datos con `express-validator`.
- Guarda únicamente un hash de la contraseña con `bcryptjs`.
- Inicia sesión y entrega un token JWT con vigencia de 2 horas.
- Protege la ruta de perfil con el token.
- Permite crear, listar, consultar, editar y eliminar solicitudes de cita del usuario autenticado.
- Devuelve errores claros sin exponer contraseñas ni detalles internos.

El código separa `src/routes/` (endpoints), `src/controllers/` (operaciones), `src/validators/` (reglas de entrada), `src/middleware/` (validación y autorización), `src/models/` (esquemas de usuario y reserva) y `src/config/` (conexión a MongoDB y servicios).

## Requisitos

- Node.js 24 LTS y npm.
- Un clúster gratuito M0 de MongoDB Atlas.
- Un usuario de base de datos y la IP actual autorizada en Atlas.
- Postman para mostrar los endpoints en el video.

## Preparación local

En PowerShell, dentro de esta carpeta:

```powershell
npm ci
Copy-Item .env.example .env
```

Abre `.env` y reemplaza `MONGODB_URI` por la cadena de conexión de Atlas. Elige un `JWT_SECRET` aleatorio de al menos 32 caracteres. Si la contraseña del usuario de base de datos tiene caracteres especiales, codifícalos para una URL al ponerla en la cadena. Nunca compartas el archivo `.env` ni lo subas a GitHub.

Después ejecuta:

```powershell
npm start
```

La consola debe mostrar `NOVA API en http://localhost:3000`. Compila Angular con `npm run build` desde la raíz antes de abrir esa dirección para usar el frontend principal. La ruta `GET /api/health` debe devolver `"database": "connected"`.

## Endpoints

| Método | Ruta | Para qué sirve | Respuesta esperada |
| --- | --- | --- | --- |
| GET | `/api/health` | Confirma API y conexión a MongoDB | 200 |
| POST | `/api/auth/register` | Registra un usuario | 201 |
| POST | `/api/auth/login` | Autentica y entrega JWT | 200 |
| GET | `/api/auth/me` | Devuelve perfil con token Bearer | 200 |
| GET | `/api/reservations` | Lista las solicitudes propias | 200 |
| GET | `/api/reservations/:id` | Consulta una solicitud propia | 200 |
| POST | `/api/reservations` | Crea una solicitud pendiente | 201 |
| PUT | `/api/reservations/:id` | Actualiza una solicitud propia | 200 |
| DELETE | `/api/reservations/:id` | Elimina una solicitud propia | 204 |

Ejemplo de cuerpo JSON para registro:

```json
{
  "name": "Cliente NOVA",
  "email": "cliente.nova@example.com",
  "password": "Clave12345"
}
```

Para iniciar sesión se envían únicamente `email` y `password`. Para consultar el perfil se envía `Authorization: Bearer TU_TOKEN`.

El correo duplicado devuelve 409, los datos inválidos 422, la contraseña incorrecta o el token ausente 401. Una solicitud ajena o inexistente devuelve 404. Para crear o editar una cita se envían `service` (`limpieza`, `hidratacion`, `masaje` o `corporal`), `scheduledAt` (fecha ISO futura) y `notes` (opcional, máximo 500 caracteres). La solicitud no implica confirmación de disponibilidad.

## Pruebas con Postman

Importa `postman/NOVA-Studio.postman_collection.json`. La colección contiene trece peticiones en orden. El registro válido crea un correo de prueba nuevo y guarda el token; las últimas cinco peticiones crean, consultan, editan y eliminan una solicitud de prueba. Ejecuta cada petición para entender su respuesta o usa `Run collection` para probarlas juntas.

## Comprobación automática

```powershell
npm test
```

Las pruebas simulan las operaciones de los modelos en memoria. No necesitan credenciales de Atlas ni descargan MongoDB. Cubren autenticación y el CRUD de solicitudes, incluida la separación por usuario. La conexión real a Atlas se verifica por separado con `/api/health` al iniciar la API.

## Relación con el proyecto frontend

La aplicación en `frontend/` presenta la marca y sus servicios. Express sirve la compilación Angular en `/`, `/login`, `/register`, `/profile` y `/reservations`; las direcciones antiguas `.html` redirigen a las rutas Angular. Si no existe una compilación, Express muestra la versión HTML anterior. El frontend usa `/api` para autenticación y solicitudes de cita. La portada dirige a los usuarios a la pantalla de citas. La gestión de servicios y la confirmación administrativa de citas están pendientes.

## Entrega de la actividad

La entrega incluye el repositorio con ramas y commits, un video que muestra los endpoints en Postman y un PDF con los enlaces y un resumen ejecutivo.
