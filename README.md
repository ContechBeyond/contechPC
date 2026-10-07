# Propuestas comerciales Contech

Aplicación responsiva para importar conceptos, revisar importes y generar propuestas comerciales en Word editable y PDF tamaño carta. Utiliza el logo y la plantilla Contech suministrados, sin columna Unidad.

## Uso

1. En Google Sheets, descarga la matriz mediante **Archivo → Descargar → Microsoft Excel (.xlsx)**. Carga el archivo en la app, o usa el enlace de una hoja pública.
2. La app busca primero la pestaña «Cliente». Si no existe, busca tablas por su contenido en las demás pestañas, con preferencia a «Cotización» o «Propuesta». Puedes cambiar la hoja seleccionada. Los enlaces normales de Sheets públicos se leen como un libro Excel completo para conservar los encabezados y detectar sus pestañas.
3. Completa proyecto, cliente y folio. La fecha sugerida es la actual en Ciudad de México; la vigencia sugerida es el último día del mes. Ambas pueden cambiarse. La portada muestra únicamente mes y año, por ejemplo «Octubre 2026»; la vigencia conserva su fecha completa.
4. Revisa las consideraciones técnicas y comerciales. Se muestran las habituales de Contech, con 60% de anticipo y 40% al finalizar.
5. Revisa las diferencias de cantidad × precio, importe o total sin IVA. Puedes recalcular los importes o seleccionar **Conservar importes originales e ignorar diferencias** para aceptar las diferencias de cálculo y generar la propuesta con los valores de tu matriz. También puedes volver a revisarlas.
6. Abre la vista previa o descarga Word y PDF. La tabla se ajusta al ancho del documento, conserva completas las filas habituales y repite el encabezado cuando continúa en otra página.

Los datos de cada propuesta se mantienen únicamente durante la sesión de la página. Al recargarla se pierden. No hay historial ni base de datos. Los archivos y documentos se procesan en el navegador; solo la lectura de Google Sheets requiere comunicarse con Google.

## Versión final (VM → VF)

La pestaña **Versión final** recibe un archivo `.xlsx` o un enlace normal del libro completo de Google Sheets. Al cargarlo, prepara automáticamente el Excel VF y un único PDF con vista previa. No modifica la fuente ni guarda un historial.

- Para un archivo, usa su nombre sin `.xlsx`. Para Sheets, obtiene el título original del libro desde la descarga de Google. Sustituye únicamente la palabra `VM` por `VF`, conservando los demás caracteres y números. Un sufijo del archivo como `(4)` también se conserva.
- Conserva `Resumen Costos` (o `Resumen`), `Matriz` y `Mano de Obra`, en ese orden y con sus nombres originales. Retira las demás hojas de la copia final.
- Revisa las referencias de fórmulas, fórmulas compartidas y nombres definidos antes de retirar hojas. Las celdas que necesitan datos de una hoja retirada conservan el resultado original en la misma posición. Las demás fórmulas permanecen activas. No añade filas, hojas auxiliares ni información a las tablas.
- Modifica directamente las partes necesarias del paquete XLSX; conserva los estilos, fuentes, bordes, combinaciones, dimensiones y valores originales. No usa la exportación de SheetJS para reconstruir el formato ni redondea los valores internos. Verifica todos los valores de las hojas conservadas antes de habilitar las descargas.
- Imprime el contenido de cada hoja en Carta horizontal, con una página de ancho y las páginas de alto necesarias. Las filas y combinaciones se mantienen completas. Cada hoja comienza en una nueva página. El encabezado muestra el nombre VF a la izquierda y el nombre de la hoja a la derecha; el pie indica `x de x` sobre el PDF completo. Los encabezados y pies se dibujan con Arial de 10 puntos y quedan separados de las tablas.

El PDF VF reproduce las tablas mediante imágenes de alta resolución (216 ppp). El texto de ese PDF no es seleccionable; el Excel sigue siendo editable. Se conserva el formato numérico de impresión de los ejemplos de Contech, con punto de miles y coma decimal. Esta presentación no cambia los números guardados en el Excel.

Las fórmulas deben tener resultados guardados: si falta uno, la app indica la celda y pide abrir y guardar la VM en Excel o Sheets. También indica los errores existentes o las dependencias que no puede retirar con seguridad, en lugar de generar una VF con referencias rotas. La impresión admite tablas e imágenes; los gráficos, objetos, texto girado y reglas dependientes de hojas retiradas requieren preparación en Excel. Los libros con otros formatos avanzados de impresión deben revisarse en la vista previa.

La carga de Excel y los enlaces públicos funcionan sin credenciales. La conexión a libros privados requiere el cliente OAuth descrito más abajo y acceso al documento; debe validarse con la cuenta de la empresa cuando se configure. No se admiten enlaces de una sola pestaña publicada como CSV, porque no incluyen todas las hojas ni su formato.

Se verificó la VM de Videoportero proporcionada: 178 celdas conservadas, 81 fórmulas activas, dos celdas dependientes de Misceláneos conservadas como valores y tres páginas de PDF. Excel recalculó los totales originales `20192.17248` y `4875` sin errores; cambiar Mano de Obra actualizó Matriz. Una prueba con 62 filas de mano de obra generó nueve páginas con numeración global y el total completo en la última página. Las pruebas y los datos de los clientes permanecen fuera del repositorio.

La detección busca en las filas disponibles, sin una fila inicial ni un orden de columnas fijos. Reconoce encabezados equivalentes como «Concepto», «Artículo», «Cant.», «Cantidad», «Precio unitario», «P.U.» e «Importe», ignorando acentos, puntuación y etiquetas de moneda. Comprueba que debajo haya conceptos con datos de cantidad, precio o importe; ignora títulos, notas y encabezados repetidos, y termina al llegar al total o a otra tabla con columnas diferentes.

Si encuentra varias tablas, solicita elegir la tabla. Si no reconoce los nombres o hay columnas ambiguas, permite indicar la fila de encabezados y relacionar las columnas manualmente. No usa el color como criterio y no requiere que exista «Unidad». Los enlaces publicados como CSV contienen solo la pestaña publicada, por lo que esa importación busca dentro de esa pestaña.

Los precios admiten formatos como `6.941,86`, `6,941.86` y números de Excel. La salida utiliza el formato de las propuestas proporcionadas: `$3.980,94`. Se admiten hasta 200 conceptos y archivos de hasta 10 MB. Para mantener filas completas, cada descripción admite hasta 2.400 caracteres.

Los precios e importes importados se expresan a dos decimales, como en la propuesta. Si Excel calcula un importe con decimales ocultos del precio, la app señala la diferencia frente al precio mostrado; puedes revisar el precio, recalcular el importe o aceptar la diferencia y conservar los valores originales. Al aceptarla, Word y PDF mantienen los importes de las filas y su suma como total. La aceptación se aplica a los valores revisados y se revoca para un concepto si modificas su cantidad, precio o importe. Una nueva importación o propuesta requiere una nueva revisión. Los datos numéricos inválidos, campos incompletos y diferencias del total continúan requiriendo revisión.

La vista previa muestra el PDF real con controles para cambiar de página, ampliarla o ajustarla a la ventana. Si una fila resulta más alta que el espacio disponible en una página, el generador solicita acortar o dividir su descripción antes de exportar el PDF.

## Publicar en Render

1. Crea un repositorio de GitHub para esta app. Sube **el contenido de esta carpeta** a la raíz: `index.html`, archivos JavaScript y CSS, `assets`, `vendor` y `render.yaml`. Puedes mantener el repositorio privado y conectarlo a Render.
2. En Render, selecciona **New → Static Site** y conecta ese repositorio.
3. Configura lo siguiente:

| Campo | Valor |
|---|---|
| Name | `contech-propuestas` o el nombre disponible que prefieras |
| Branch | La rama que contenga estos archivos |
| Root Directory | Vacío, si los archivos están en la raíz |
| Build Command | `true` |
| Publish Directory | `.` |

4. Crea el sitio estático. Render proporcionará la dirección HTTPS para compartir con el equipo.

También puedes crear un **Blueprint** conectado al mismo repositorio: `render.yaml` incluye la configuración. El comando `true` no compila ni instala paquetes; los archivos ya están listos para publicarse. No se necesita un servidor de aplicación.

Un Static Site no utiliza las horas de instancia gratuita de los Web Services. Sí utiliza el ancho de banda y el proceso de despliegue del workspace. Las propuestas descargadas se generan localmente, por lo que su tamaño no corresponde a descargas desde un servidor de Contech. Consulta los límites vigentes de tu workspace y la [documentación de Render](https://render.com/docs/static-sites).

El sitio no tiene inicio de sesión ni control de acceso. Su plantilla, membrete y datos bancarios se entregan al navegador para generar los documentos. Los conceptos cargados por cada compañero no se publican ni se guardan en Render.

## Activar enlaces de Sheets privados

La importación de archivos y de hojas públicas funciona sin esta configuración. Para que **Conectar Google** permita leer hojas privadas, un administrador debe completar la configuración OAuth una sola vez:

1. En Google Cloud, crea o selecciona el proyecto de la empresa y habilita **Google Sheets API**.
2. Configura la pantalla de consentimiento de OAuth. Si la empresa usa Google Workspace, puedes elegir una aplicación interna para su organización. Para una aplicación externa en modo de prueba, añade los compañeros como usuarios de prueba y respeta las restricciones de Google.
3. Crea un **ID de cliente OAuth** de tipo **Aplicación web**.
4. Añade a **Orígenes autorizados de JavaScript** la dirección exacta del sitio Render, sin ruta final; por ejemplo, el origen HTTPS que Render te asigne. Para pruebas locales, añade también `http://127.0.0.1:4173`.
5. Copia el **ID de cliente**, que termina en `.apps.googleusercontent.com`, al campo `googleClientId` de `config.js`. No coloques un secreto de cliente, contraseña ni clave privada en ese archivo.
6. Publica ese cambio. Cada compañero deberá autorizar la lectura de sus hojas y tener acceso a la hoja que desea importar.

El permiso usado es `https://www.googleapis.com/auth/spreadsheets.readonly`. El token se mantiene en memoria durante la sesión y no se guarda. La conexión es solo para leer datos; no escribe ni modifica la hoja. Consulta el [modelo de tokens de Google](https://developers.google.com/identity/oauth2/web/guides/use-token-model) y la [configuración de la API de Sheets](https://developers.google.com/workspace/sheets/api/quickstart/js).

## Cambiar condiciones o formato

- `assets/defaults.json`: condiciones habituales, textos introductorios y confidencialidad. Las modificaciones aparecerán al abrir una nueva sesión de la app.
- `assets/template.docx`: base Word con el formato suministrado, membrete, tabla nativa y fuentes incrustadas. Los datos de la propuesta de ejemplo se sustituyeron por marcadores genéricos. Sus marcadores sirven como referencias del generador; cambiar su estructura requiere ajustar `exporters.js`.
- `assets/cover.png`, `assets/letterhead.png` y `assets/bank.jpg`: imágenes del formato PDF.
- `assets/logo.jpeg`: logo mostrado en la app.
- `styles.css`: apariencia responsiva de la app.

Word mantiene el formato y las fuentes de la plantilla. El PDF usa Carlito, una fuente de licencia abierta compatible en métricas con Calibri, con el mismo tamaño de página, colores, membrete y márgenes. Puede haber diferencias pequeñas en cortes de línea o paginación entre Word y PDF.

Los datos bancarios se encuentran también en la imagen del formato y en la plantilla Word: cambiarlos solo en `defaults.json` no modifica los documentos. Actualiza esos dos recursos si cambia la cuenta.

## Prueba local

No abras `index.html` directamente con doble clic: el navegador necesita servir los recursos por HTTP.

Desde esta carpeta, con Python instalado, ejecuta:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Después abre `http://127.0.0.1:4173/`. Para uso del equipo, utiliza el enlace HTTPS de Render.

## Validación de la versión

Se comprobó la importación de un archivo Excel con los importes de Cámaras — Tabachines, el total `$3.980,94`, la detección y corrección de diferencias, la vista previa y la descarga de ambos formatos. Una tabla de 30 conceptos se generó en Word y PDF y se revisó en sus 7 páginas. Se comprobó también la distribución de escritorio y de móvil de 390 px de ancho sin desbordamiento horizontal.

Se verificó la importación por enlace de la matriz de Videoportero y sus cinco conceptos desde «Cliente», el total sin IVA, y la diferencia producida por un precio calculado con decimales ocultos. Las pruebas de detección incluyen encabezados en la fila 76, columnas reordenadas, pestañas renombradas, alias de encabezados, encabezados repetidos, tablas múltiples, notas y valores inválidos. Las matrices de prueba permanecen fuera del repositorio y del paquete de publicación.

La conexión OAuth a hojas privadas queda pendiente de un ID de cliente de la empresa y de una prueba con su cuenta. Las dependencias y sus licencias están en `LICENSES.md`.
