# Cobertura de Q10 en NOVA Studio

Alcance revisado: contenido de Q10 completado desde «Primeros pasos» hasta «Introducción a Frontend: TypeScript». En la consulta del 22 de octubre de 2026, el curso marcaba 86 %. Angular aparece después de TypeScript y no se incluyó en este alcance. Una lección terminada en Q10 no significa que cada técnica de esa lección deba aparecer en un solo proyecto.

| Bloque de Q10 | Aplicación comprobable en NOVA | Temas del bloque que no se usan aquí |
| --- | --- | --- |
| Primeros pasos | Estructura de un sitio y separación entre navegador y servidor. | El uso de un IDE se aprende como herramienta, no como función de la web. |
| Fundamentos de HTML | `index.html` usa encabezados, secciones semánticas, imágenes, enlaces y formularios. | No se necesita una tabla de datos ni video integrado en la página. |
| CSS | `css/styles.css` usa selectores, modelo de caja, estados hover, Flexbox, Grid y media queries para móvil. | No hay animaciones con `@keyframes` ni Bootstrap. |
| Git y GitHub | El repositorio tiene historial de commits y ramas de trabajo. | SourceTree es una herramienta opcional; no forma parte del código. |
| Metodologías ágiles | Las funciones se pueden organizar como pendientes y criterios de aceptación. | El repositorio no contiene evidencia verificable de sprints, ceremonias o roles Scrum; no se atribuyen retrospectivamente. |
| Introducción y profundización en JavaScript | `src/auth.ts` se compila a JavaScript que usa funciones, objetos, arreglos, condicionales, DOM, eventos, `fetch` y almacenamiento de sesión. | Los cuadros de diálogo y ejercicios aritméticos no aportan al flujo de autenticación. |
| Node.js y Express.js | `backend/src/` implementa API HTTP, rutas, middleware, validación, manejo de errores y autorización por JWT. | No hay carga de archivos con Multer, manejo de archivos de usuario ni rutas con parámetros dinámicos. |
| MongoDB | `backend/src/models/User.js` define el esquema de usuario; Mongoose conecta con Atlas y las rutas usan operaciones asíncronas. | No se usan agregaciones ni Mongo Shell dentro de la aplicación. |
| TypeScript | `src/auth.ts` tiene configuración estricta en `tsconfig.json`, interfaces para respuestas, tipos de funciones, validaciones de datos desconocidos y una clase de error. `npm run build` produce `js/auth.js`; el mapa de origen permite depurar el código. | No se fuerzan tuplas, enums o aserciones de tipo porque el flujo no las necesita. |

## Funciones actuales y pendientes

- Funciona: presentación responsive, registro, inicio y cierre de sesión, perfil protegido y conexión a MongoDB Atlas.
- Pendiente fuera de la autenticación: envío real del formulario de contacto, gestión de servicios y reservas.
- Angular y el bloque de Testing de Q10 no se han incorporado: aparecen después del límite de estudio acordado.
- Las pruebas técnicas verifican funcionamiento; no acreditan autoría manual del código ni la realización personal de las actividades del curso.
