# Contech · Consulta SYSCOM

Extensión para Chrome de escritorio (120 o posterior). Consulta un modelo por solicitud desde **Crear matriz (VM)** y devuelve los campos visibles de la ficha a la app. Usa la sesión de SYSCOM del mismo perfil de Chrome.

## Instalar

1. Descarga `contech-syscom-extension.zip` desde la app y extrae el ZIP. Conserva la carpeta extraída mientras uses la extensión.
2. En Chrome, abre `chrome://extensions` y activa **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida** y selecciona la carpeta `contech-syscom` que contiene `manifest.json`.
4. Abre la app de Contech publicada en Render. Desde el icono de extensiones, abre **Contech · Consulta SYSCOM**.
5. Comprueba la dirección de la app y pulsa **Conectar esta app**. Chrome pedirá acceso a esa dirección concreta y a SYSCOM. La extensión admite sitios `*.onrender.com` y pruebas locales en `localhost` o `127.0.0.1`.
6. Inicia sesión directamente en SYSCOM usando el mismo perfil de Chrome. La extensión no necesita tu contraseña.
7. En **Crear matriz**, escribe un modelo y pulsa **Buscar en SYSCOM**. Si no hubo una coincidencia exacta, elige la variante correcta de los resultados.

La extensión usa una pestaña propia de SYSCOM para las consultas, aprovechando la sesión de tu perfil. No modifica las demás pestañas de SYSCOM que ya tengas abiertas. Desde su icono puedes abrir la pestaña de consulta o pausar las búsquedas.

## Datos y precios

Completa modelo, concepto, descripción, marca y proveedor. La cantidad se conserva. El precio solo se completa automáticamente cuando hay una opción clara con moneda identificada y sin IVA. Si aparecen varios precios o falta el dato de IVA, muestra opciones para revisión; un precio identificado con IVA no se puede aplicar. Si falta la moneda, el precio o la sesión, deja el costo pendiente para captura manual. Siempre puedes editar los campos.

Se lee el contenido renderizado de la ficha. No se consultan endpoints privados, no se extraen cookies, no se hacen pedidos y no se guardan contraseñas ni precios. Chrome conserva los sitios que conectaste, las marcas de tiempo de las consultas de la última hora y el estado de pausa. La selección temporal de modelos desaparece al cerrar Chrome; no es un historial de propuestas.

## Ritmo y detención

- Cada búsqueda requiere pulsar un botón; no se busca por cada letra escrita ni se recorre el catálogo.
- Una consulta en curso por perfil de Chrome, al menos **15 segundos** entre búsquedas y hasta **60 búsquedas por hora**. Las cuentas de Chrome en otros equipos tienen sus propios límites.
- Entre la página de resultados y una ficha se esperan **4 segundos**. Se consulta únicamente la primera página de resultados.
- No hay reintentos automáticos de navegación. Las esperas de lectura observan cambios en el documento ya cargado y no generan peticiones a SYSCOM.
- Un CAPTCHA, una verificación de seguridad o un mensaje de bloqueo pausa las consultas. La extensión no lo resuelve ni continúa buscando. Revisa la pestaña y usa **Reanudar consultas** cuando corresponda.
- **Cancelar consulta** cierra únicamente la pestaña creada por la extensión si todavía muestra esa consulta. Si la usaste para otra página, se conserva.

Son límites internos de Contech, no límites aprobados o publicados por SYSCOM. La extensión no altera la identificación del navegador, simula movimientos para ocultarse ni garantiza que una automatización sea aceptada.

## Actualizar o retirar

Después de actualizar los archivos, pulsa **Recargar** en la tarjeta de la extensión de `chrome://extensions` y recarga la app de Contech. Cada compañero debe actualizar su copia. Para retirarla, usa **Quitar** en Chrome.

La lectura de datos puede necesitar ajustes si SYSCOM cambia la estructura de sus páginas. La validación con el precio particular de cada distribuidor debe realizarse con su sesión iniciada en Chrome.
