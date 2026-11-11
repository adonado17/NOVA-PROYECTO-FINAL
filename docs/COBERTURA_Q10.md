# Cobertura de Q10 en NOVA Studio

Alcance revisado: contenido de Q10 completado desde «Primeros pasos» hasta «Introducción a Frontend: TypeScript». En la consulta del 22 de octubre de 2026, el curso marcaba 86 %. La estructura Angular añadida después sigue el ejemplo visto en clase el 27 de octubre; eso no confirma que el bloque Angular de Q10 esté terminado. Una lección terminada en Q10 no significa que cada técnica de esa lección deba aparecer en un solo proyecto.

| Bloque de Q10 | Aplicación comprobable en NOVA | Temas del bloque que no se usan aquí |
| --- | --- | --- |
| Primeros pasos | Estructura de un sitio y separación entre navegador y servidor. | El uso de un IDE se aprende como herramienta, no como función de la web. |
| Fundamentos de HTML | `index.html` usa encabezados, secciones semánticas, imágenes, enlaces y formularios. | No se necesita una tabla de datos ni video integrado en la página. |
| CSS | `css/styles.css` usa selectores, modelo de caja, estados hover, Flexbox, Grid y media queries para móvil. | No hay animaciones con `@keyframes` ni Bootstrap. |
| Git y GitHub | El repositorio tiene historial de commits y ramas de trabajo. | SourceTree es una herramienta opcional; no forma parte del código. |
| Metodologías ágiles | Las funciones se pueden organizar como pendientes y criterios de aceptación. | El repositorio no contiene evidencia verificable de sprints, ceremonias o roles Scrum; no se atribuyen retrospectivamente. |
| Introducción y profundización en JavaScript | `src/auth.ts` se compila a JavaScript que usa funciones, objetos, arreglos, condicionales, DOM, eventos, `fetch` y almacenamiento de sesión. | Los cuadros de diálogo y ejercicios aritméticos no aportan al flujo de autenticación. |
| Node.js y Express.js | `backend/src/` implementa API HTTP, rutas con parámetros, middleware, validación, manejo de errores y autorización por JWT. | No hay carga de archivos con Multer ni manejo de archivos de usuario. |
| MongoDB | Los modelos de usuario y reserva definen esquemas; Mongoose conecta con Atlas y las rutas usan operaciones asíncronas. | No se usan agregaciones ni Mongo Shell dentro de la aplicación. |
| TypeScript | `src/auth.ts` conserva la versión HTML anterior. La aplicación principal usa TypeScript en componentes, interfaces, servicios y guard de `frontend/src/app/`. | No se fuerzan tuplas, enums o aserciones de tipo porque el flujo no las necesita. |
| Angular (clase en vivo) | `frontend/src/app/` separa páginas, rutas, servicios HTTP, guard, interfaces, navbar y URL base `/api`. La pantalla de citas aplica el patrón CRUD al dominio NOVA. | La lista de tareas del profesor es un ejemplo de otro dominio. |

## Funciones actuales y pendientes

- Funciona: presentación responsive, registro, inicio y cierre de sesión, perfil protegido y CRUD de solicitudes de cita con MongoDB Atlas.
- Pendiente: confirmación administrativa de disponibilidad y gestión de servicios. Las citas creadas se registran como pendientes.
- La estructura Angular observada en clase está incorporada; el bloque de Testing de Q10 sigue fuera del límite de estudio acordado.
- Las pruebas técnicas verifican funcionamiento; no acreditan autoría manual del código ni la realización personal de las actividades del curso.
