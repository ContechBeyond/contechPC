# Herramientas Contech

Portal responsivo de herramientas para Contech. Incluye **Crear matriz (VM)**, para capturar equipos y costos en un Excel con fórmulas y formato de la empresa; **Propuesta comercial**, para generar Word editable y PDF tamaño carta; y **Versión final**, para convertir matrices VM a Excel y PDF VF.

La página de inicio muestra el catálogo. El menú lateral permite cambiar de herramienta; en móvil se abre con el botón de menú y se cierra al elegir una opción, pulsar Escape o tocar fuera. Incluye navegación por teclado y mantiene los datos de los formularios al cambiar de herramienta o regresar a Inicio. Las rutas `#/herramientas`, `#/crear-matriz`, `#/propuesta-comercial` y `#/version-final` permiten enlaces directos y funcionan con Atrás/Adelante, sin recargar la página ni configurar redirecciones en Render.

## Añadir una herramienta

El catálogo se define en `tools.js`. `portal.js` genera automáticamente el menú, las tarjetas, el contador, el título, la ubicación y las rutas a partir de ese registro. `portal.css` controla la distribución común y usa los colores de los temas claro y oscuro.

1. Añade una sección a `index.html`, inicialmente con `hidden`, con un identificador único y un encabezado que pueda recibir foco, por ejemplo:

   ```html
   <section id="nueva-view" aria-labelledby="nueva-title" hidden>
     <div class="page-heading"><h1 id="nueva-title" tabindex="-1">Nueva herramienta</h1></div>
     <!-- Interfaz de la herramienta -->
   </section>
   ```

2. Crea su módulo y registra la herramienta en el arreglo `TOOLS` de `tools.js`:

   ```js
   {
     id:'nueva',slug:'nueva-herramienta',viewId:'nueva-view',headingId:'nueva-title',
     title:'Nueva herramienta',description:'Describe brevemente lo que permite hacer.',
     icon:'<path d="M4 4h16v16H4Z"/>',
     load:()=>import('./nueva-herramienta.js').then(module=>module.initNuevaHerramienta())
   }
   ```

   `id` y `slug` deben ser únicos; `herramientas` está reservado para Inicio. `badge` y `formats` son opcionales. El orden del arreglo determina el orden del catálogo y del menú.

3. Inicializa los eventos propios de esa herramienta en su módulo. El portal ejecuta `load` una vez al abrirla, mantiene la vista montada y ofrece reintentar si la carga falla. Usa clases específicas para sus estilos y las variables de color compartidas. El menú puede crecer y desplazarse sin cambiar el código de navegación.

Propuesta comercial y Versión final comparten el módulo `app.js`, que inicializa sus controles una sola vez cuando se abre cualquiera de ellas. Crear matriz usa `vm-ui.js`, con cálculos en `vm-core.js`, exportación en `vm-xlsx.js`, borrador local en `vm-draft.js` y estilos en `vm.css`. Los generadores siguen independientes de la navegación del portal.

## Crear matriz (VM)

1. Abre **Crear matriz (VM)**. En **Datos**, captura cliente y proyecto. Las pestañas **Datos**, **Equipos y materiales**, **Mano de obra**, **Volumetría** y **Misceláneos** muestran una sección a la vez y conservan lo capturado al cambiar de hoja. En móvil se desplazan horizontalmente; con teclado puedes usar las flechas, Inicio y Fin.
2. En **Equipos y materiales**, agrega las partidas. **Solo el concepto es obligatorio en las partidas**; descripción, modelo, marca, proveedor, cantidad y precio son opcionales. Al agregar un equipo, el anterior se colapsa y el nuevo queda abierto. Cada equipo también se puede colapsar pulsando su encabezado, que muestra el concepto y se actualiza al editarlo o completar desde SYSCOM. **Colapsar todos** y **Expandir todos** permiten revisar listas largas sin perder los datos. Puedes completar los datos por modelo con la extensión de SYSCOM descrita abajo. Elige USD o MXN por partida (USD inicial). Se aceptan punto o coma decimal; captura los números sin separadores de miles.
3. Abre **Mano de obra**, **Volumetría** o **Misceláneos** cuando las necesites y agrega sus partidas. Se incluyen automáticamente si hay datos y se omiten si están vacías; abrir una pestaña o agregar una fila totalmente vacía no la incluye. También requieren solo el concepto al capturar una partida. Los demás datos son opcionales. Los campos vacíos aparecen como `-` en Excel. Si falta cantidad o precio, el importe de esa partida queda en `-` y no aporta al total; un precio capturado como cero se conserva como cero. Las fórmulas evitan errores y se recalculan al completar esas celdas en Excel. Para excluir una sección, elimina sus partidas o vacía lo capturado; cambiar de pestaña no la excluye. El botón **Revisar** abre la hoja y el campo que necesita completarse.
4. En **Datos**, revisa **Tipo de cambio y porcentajes**. Los valores iniciales editables son 19 MXN/USD, indirectos 21.6%, fee 50%, comisión 5% y aprovisionamiento 3%. El cálculo aplica indirectos al costo directo, fee al costo integrado, y comisión y aprovisionamiento al costo más fee.
5. El criterio predeterminado **Conservar decimales internos** conserva la precisión de los cálculos. La alternativa **Redondear precio de venta unitario a 2 decimales** multiplica ese precio redondeado por la cantidad. Los importes se muestran a dos decimales sin cambiar los valores internos del criterio predeterminado.
6. Descarga el Excel. El folio se genera en ese momento, en hora de Ciudad de México, con `HHmmddMMyyyy`. El archivo se llama `<cliente> - <proyecto> VM <folio>.xlsx`.

El libro incluye **Resumen Costos**, **Matriz** y **Cliente**, en ese orden; después se agregan **Mano de Obra**, **Volumetria** y **Misceláneos** únicamente si tienen partidas con datos. Las filas totalmente vacías no aparecen en el archivo. La plantilla conserva los colores, fuentes, bordes, combinaciones y anchos de columna de las matrices de referencia. Las filas se adaptan a la cantidad de partidas y a sus textos; si una descripción excede la altura máxima de Excel, se pide acortarla.

Las cantidades y precios de Mano de Obra y Misceláneos alimentan Matriz mediante referencias; Resumen Costos y Cliente toman los importes de Matriz. Las fórmulas se entregan con sus resultados calculados y se recalculan al abrir el libro en Excel. Los porcentajes se editan en Resumen Costos y el tipo de cambio en Matriz. La volumetría puede tomar el precio manual o referenciar el costo de un equipo dividido entre las unidades de su presentación, por ejemplo 152 metros por bobina. Es un desglose auxiliar y no se suma otra vez al total del proyecto.

Cliente y proyecto siguen siendo necesarios para nombrar el archivo. Se validan los conceptos, los números cuando se capturan (cantidades mayores que cero y precios no negativos), porcentajes y referencias de volumetría a equipos existentes. Las unidades por presentación son opcionales: si faltan en una volumetría vinculada, su precio queda en `-`; completa ese dato en el formulario para generar la referencia con su divisor. Matriz y Cliente admiten hasta 200 conceptos. El archivo puede cargarse en las otras dos herramientas; Propuesta comercial mantiene su revisión de diferencias ocasionadas por los decimales internos.

**Guardado automático:** cada modificación de la matriz se guarda inmediatamente en `localStorage`, bajo `contech-matrix-draft`, y se recupera al recargar o reabrir la app en el mismo navegador, perfil y dirección del sitio. Conserva los campos incompletos, los decimales escritos, los porcentajes, todas las partidas, los vínculos de volumetría, las tarjetas abiertas o colapsadas y la pestaña seleccionada. Recupera también los borradores anteriores: sus secciones con datos se incluyen según la nueva regla automática. Los precios de SYSCOM pendientes de revisión siguen pendientes al recuperar el borrador; no se reanudan consultas ni se recuperan tokens u opciones temporales del proveedor. El folio se sigue generando al descargar el Excel.

**Limpiar todo** abre una confirmación. Cancelar o pulsar Escape conserva los datos; confirmar elimina únicamente el borrador de la matriz y deja el formulario con sus valores iniciales. Mantiene el tema y las preferencias de otras herramientas. Generar un Excel no borra el borrador. Si el navegador bloquea el almacenamiento, no hay espacio o el borrador no se puede leer, se muestra un aviso y la captura sigue funcionando. Si falla la eliminación del borrador, se conservan los datos actuales y se informa del problema. No hay sincronización entre equipos ni historial de versiones.

## Consulta de modelos en SYSCOM

**Crear matriz** incluye **Buscar en SYSCOM** en cada equipo. Requiere la extensión **Contech · Consulta SYSCOM** en Chrome de escritorio y tu sesión de distribuidor iniciada en ese mismo perfil. La app puede seguir publicada como Static Site en Render; la consulta ocurre en el navegador de cada compañero.

El icono de conexión, junto al cambio de tema, muestra el estado de la extensión al abrir Crear matriz. Su menú contiene **Descargar extensión**, **Verificar conexión** y **Cómo instalar y conectar**; se cierra con Escape, al tocar fuera o con su botón de cierre. El indicador distingue conexión, desconexión y pausa, con una etiqueta de estado accesible. Este cambio de interfaz utiliza la extensión 1.0.1 existente.

Las instrucciones completas están en [extensions/contech-syscom/README.md](extensions/contech-syscom/README.md). Se instala la carpeta descomprimida desde `chrome://extensions`, se abre la app y se pulsa **Conectar esta app** en el icono de la extensión de Chrome. Chrome solicita acceso únicamente al sitio de la app que conectaste y a SYSCOM. Se admiten direcciones `*.onrender.com` y pruebas locales.

Al pulsar Buscar, abre una pestaña propia de SYSCOM y lee los resultados visibles de la primera página. Comprueba el modelo exacto antes de usar una ficha; cuando hay variantes o varias coincidencias, permite elegir. Completa concepto, descripción, modelo, marca y proveedor, conservando la cantidad. El costo toma el precio principal de compra de la tarjeta, con moneda y sin IVA; «+ IVA» identifica un precio al que todavía debe agregarse el impuesto, por lo que se captura el importe mostrado sin sumarle IVA. Descarta lista, «Precio especial», «Desde», mayoreo, ahorros, promociones de regreso, envío y pagos mensuales. Las etiquetas y la jerarquía visual distinguen el principal; no se elige por ser el precio mayor o menor. Si el principal sigue siendo ambiguo o falta el dato de IVA, requiere revisión. Los identificados con IVA quedan deshabilitados. Un costo o moneda que no se identifica permanece pendiente para captura manual.

**Agregar equipo** espera a que termine la consulta actual de SYSCOM y a que se resuelva el precio pendiente de las tarjetas consultadas. Si falta resolverlo, no agrega otra tarjeta: abre la correspondiente, muestra un aviso que desaparece automáticamente y la resalta con un color que se desvanece. No muestra un diálogo de confirmación. Seleccionar un precio o escribirlo manualmente permite continuar; **Capturar precio manualmente** permite optar por dejarlo vacío. Las tarjetas creadas manualmente aceptan un precio vacío desde el principio. Los datos y las cantidades se conservan al colapsar.

Se permite una consulta simultánea por perfil, 15 segundos entre búsquedas, 4 segundos entre resultados y ficha, y hasta 60 búsquedas por hora. Los límites y el estado de pausa se conservan al reiniciar Chrome. Los CAPTCHA y mensajes de bloqueo pausan las consultas hasta revisión y reanudación manual desde la extensión. Se puede cancelar la consulta desde el equipo. No hay consultas por cada tecla escrita, búsquedas masivas, reintentos automáticos de navegación ni alteraciones de la identificación del navegador. Estos límites son internos de Contech y no garantizan aceptación por SYSCOM.

La extensión no guarda contraseñas, precios ni fichas de productos, ni extrae cookies. Conserva únicamente las direcciones de apps autorizadas, marcas de tiempo para limitar consultas y la pausa; los candidatos de una selección son temporales. Los campos importados a la matriz, incluido el precio elegido, se conservan en el borrador local de la app descrito arriba. Para actualizar el ZIP después de cambiar la extensión, ejecuta `scripts/package-extension.ps1`. Cada compañero debe actualizar su carpeta y recargar la extensión en Chrome.

## Uso

Abre **Propuesta comercial** desde Inicio o el menú.

1. En Google Sheets, descarga la matriz mediante **Archivo → Descargar → Microsoft Excel (.xlsx)**. Carga el archivo en la app, o usa el enlace de una hoja pública.
2. La app busca primero la pestaña «Cliente». Si no existe, busca tablas por su contenido en las demás pestañas, con preferencia a «Cotización» o «Propuesta». Puedes cambiar la hoja seleccionada. Los enlaces normales de Sheets públicos se leen como un libro Excel completo para conservar los encabezados y detectar sus pestañas.
3. Completa proyecto y cliente. El folio se sugiere automáticamente desde el nombre del archivo o el título de Google Sheets: reconoce un número de 12 dígitos en cualquier posición, también en `VM163906102026` o `VF163906102026`, y conserva los ceros iniciales. Puedes editarlo. Al importar otro libro, actualiza una sugerencia anterior y respeta los folios corregidos manualmente. Si hay varios números distintos de 12 dígitos, prefiere uno identificado por VM/VF; si sigue siendo ambiguo, permite capturarlo manualmente. La fecha sugerida es la actual en Ciudad de México; la vigencia sugerida es el último día del mes. Ambas pueden cambiarse. La portada muestra únicamente mes y año, por ejemplo «Octubre 2026»; la vigencia conserva su fecha completa.
4. Revisa las consideraciones técnicas y comerciales. Se muestran las habituales de Contech, con 60% de anticipo y 40% al finalizar.
5. Revisa las diferencias de cantidad × precio, importe o total sin IVA. Puedes recalcular los importes o seleccionar **Conservar importes originales e ignorar diferencias** para aceptar las diferencias de cálculo y generar la propuesta con los valores de tu matriz. También puedes volver a revisarlas.
6. Abre la vista previa o descarga Word y PDF. La tabla se ajusta al ancho del documento, conserva completas las filas habituales y repite el encabezado cuando continúa en otra página.

Los datos de cada propuesta se mantienen únicamente durante la sesión de la página. Al recargarla se pierden. No hay historial ni base de datos. Los archivos y documentos se procesan en el navegador; solo la lectura de Google Sheets requiere comunicarse con Google.

El botón de sol/luna de la cabecera cambia entre modo claro y oscuro. La primera visita sigue el tema del dispositivo; después se conserva la elección en este navegador y se sincroniza entre pestañas. Esta preferencia es independiente del borrador de Crear matriz. Ambos temas incluyen colores legibles para campos, tablas, mensajes y controles de teclado. La vista previa conserva los colores del documento que se descargará.

## Versión final (VM → VF)

La herramienta **Versión final** recibe un archivo `.xlsx` o un enlace normal del libro completo de Google Sheets. Al cargarlo, prepara automáticamente el Excel VF y un único PDF con vista previa. No modifica la fuente ni guarda un historial.

- Para un archivo, usa su nombre sin `.xlsx`. Para Sheets, obtiene el título original del libro desde la descarga de Google. Sustituye únicamente la marca `VM` por `VF`, conservando los demás caracteres y números. Acepta la marca separada o unida al folio, por ejemplo `VM161201102026` se convierte en `VF161201102026`. Un sufijo del archivo como `(4)` también se conserva.
- Conserva `Resumen Costos` (o `Resumen`) y `Matriz`, en ese orden y con sus nombres originales. Si existe `Mano de Obra`, la conserva después de Matriz; es opcional para cotizaciones de solo equipo. Retira las demás hojas de la copia final y no añade una hoja de mano de obra cuando no existe en la VM.
- Revisa las referencias de fórmulas, fórmulas compartidas y nombres definidos antes de retirar hojas. Las celdas que necesitan datos de una hoja retirada conservan el resultado original en la misma posición. Las demás fórmulas permanecen activas. No añade filas, hojas auxiliares ni información a las tablas.
- Modifica directamente las partes necesarias del paquete XLSX; conserva los estilos, fuentes, bordes, combinaciones, dimensiones y valores originales. No usa la exportación de SheetJS para reconstruir el formato ni redondea los valores internos. Verifica todos los valores de las hojas conservadas antes de habilitar las descargas.
- Imprime el contenido de cada hoja en Carta horizontal, con una página de ancho y las páginas de alto necesarias. Las filas y combinaciones se mantienen completas. Cada hoja comienza en una nueva página. El encabezado muestra el nombre VF a la izquierda y el nombre de la hoja a la derecha; el pie indica `x de x` sobre el PDF completo. Los encabezados y pies se dibujan con Arial de 10 puntos y quedan separados de las tablas.

El PDF VF reproduce las tablas mediante imágenes de alta resolución (216 ppp). El texto de ese PDF no es seleccionable; el Excel sigue siendo editable. Se conserva el formato numérico de impresión de los ejemplos de Contech, con punto de miles y coma decimal. Esta presentación no cambia los números guardados en el Excel.

Las fórmulas deben tener resultados guardados: si falta uno, la app indica la celda y pide abrir y guardar la VM en Excel o Sheets. También indica los errores existentes o las dependencias que no puede retirar con seguridad, en lugar de generar una VF con referencias rotas. La impresión admite tablas e imágenes; los gráficos, objetos, texto girado y reglas dependientes de hojas retiradas requieren preparación en Excel. Los libros con otros formatos avanzados de impresión deben revisarse en la vista previa.

La carga de Excel y los enlaces públicos funcionan sin credenciales. La conexión a libros privados requiere el cliente OAuth descrito más abajo y acceso al documento; debe validarse con la cuenta de la empresa cuando se configure. No se admiten enlaces de una sola pestaña publicada como CSV, porque no incluyen todas las hojas ni su formato.

Se verificó la VM de Videoportero proporcionada: 178 celdas conservadas, 81 fórmulas activas, dos celdas dependientes de Misceláneos conservadas como valores y tres páginas de PDF. Excel recalculó los totales originales `20192.17248` y `4875` sin errores; cambiar Mano de Obra actualizó Matriz. Una prueba con 62 filas de mano de obra generó nueve páginas con numeración global y el total completo en la última página. Las pruebas y los datos de los clientes permanecen fuera del repositorio.

También se verificó una VM de solo equipo sin Mano de Obra: se generaron dos hojas de Excel y dos páginas de PDF Carta horizontal, con encabezados y numeración global `1 de 2` y `2 de 2`. Los estilos y totales se conservaron, las fórmulas se recalcularon en Excel y las matrices que sí incluyen Mano de Obra conservaron sus tres hojas. Las pruebas de selección de hojas se ejecutan con `node --test tests/vf.test.mjs`.

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
- `assets/logo.jpeg`: logo original para el modo claro de la app.
- `assets/logo-dark.png`: versión con fondo transparente para el modo oscuro de la app.
- `assets/vm-template.xlsx`: base de Crear matriz, con el formato original y sin conceptos, precios ni datos de los proyectos de ejemplo.
- `assets/contech-syscom-extension.zip`: extensión de Chrome lista para descomprimir e instalar. Su fuente está en `extensions/contech-syscom`.
- `styles.css`: apariencia responsiva de la app.

Word mantiene el formato y las fuentes de la plantilla. El PDF usa Carlito, una fuente de licencia abierta compatible en métricas con Calibri, con el mismo tamaño de página, colores, membrete y márgenes. Puede haber diferencias pequeñas en cortes de línea o paginación entre Word y PDF.

Los datos bancarios se encuentran también en la imagen del formato y en la plantilla Word: cambiarlos solo en `defaults.json` no modifica los documentos. Actualiza esos dos recursos si cambia la cuenta.

## Cableado en Crear matriz

En **Equipos y materiales**, marca **Es cableado** en la tarjeta del material. El precio de compra (manual o importado de SYSCOM) corresponde a la bobina; indica los metros por bobina y los metros a instalar. Una longitud explícita en la descripción, por ejemplo «Bobina de Cable de 305 Metros», se sugiere al activar esta opción.

- **Por metro:** costo por metro = precio de la bobina / metros por bobina. La cantidad cobrada es la longitud a instalar.
- **Bobina completa:** se sugieren las bobinas necesarias, redondeando hacia arriba; puedes ajustar la cantidad a cobrar. Dejarla vacía restablece el cálculo automático.
- **Agregar instalación de cableado:** crea una sola partida vinculada en Mano de obra, con costo inicial de **25 MXN/m**, editable desde cualquiera de los dos formularios. La cantidad sigue los metros a instalar incluso cuando se cobran bobinas completas. Eliminar esa instalación permite volver a agregarla; desmarcar cableado o eliminar el material retira su instalación vinculada.

Los porcentajes de venta se aplican al costo base como en las demás partidas. La compra sugerida no se suma de nuevo, la volumetría sigue siendo auxiliar y los cálculos conservan la precisión interna. Cliente describe el suministro por metro o por bobina; la exportación mantiene las fórmulas y el formato de la plantilla. El borrador local conserva la modalidad, longitudes, cantidad de bobinas y tarifa de instalación.

## Prueba local

No abras `index.html` directamente con doble clic: el navegador necesita servir los recursos por HTTP.

Desde esta carpeta, con Python instalado, ejecuta:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Después abre `http://127.0.0.1:4173/`. Para uso del equipo, utiliza el enlace HTTPS de Render.

## Validación de la versión

Se verificaron el catálogo y el menú en escritorio y móvil de 390 px, en ambos temas; enlaces directos, Atrás/Adelante y conservación de formularios entre herramientas. El menú móvil devuelve el foco al cerrarse con Escape y se cierra al seleccionar una herramienta. Crear matriz se añadió mediante el registro del catálogo; también se comprobaron las cargas únicas, los reintentos y los cambios de ruta durante una carga. Los datos y scripts de las pruebas de integración permanecen fuera del repositorio.

Crear matriz se comprobó con secciones opcionales activas e inactivas, costos USD/MXN, cantidades decimales, ambos criterios de redondeo, descarga desde el navegador y referencias de volumetría. Los archivos se abrieron y recalcularon en Microsoft Excel: Matriz, Resumen Costos y Cliente conciliaron sin errores de fórmula, y un cambio en el precio de Mano de Obra actualizó las hojas dependientes. También se revisó visualmente el formato de las seis hojas y se comprobó la importación de Cliente y la conversión VM → VF. Las pruebas de cálculo se ejecutan con `node --test tests/vm.test.mjs`.

Se verificaron los equipos colapsables en escritorio, móvil y teclado, la conservación de los datos y la actualización del encabezado desde SYSCOM. También se recalcularon en Excel matrices con campos vacíos y partidas completas mezcladas, con ambos criterios de redondeo: los guiones se conservaron, los totales conciliaron y no hubo errores. Completar cantidad y precio en las celdas de equipo, mano de obra y misceláneos actualizó Matriz, Resumen Costos, Cliente y la volumetría vinculada.

La integración de SYSCOM se comprobó con el listado y una ficha pública actuales, sin sesión de distribuidor, y con pruebas simuladas del formulario, el puente y las API de Chrome. Se validaron modelos exactos, variantes, monedas, IVA, conservación de cantidad, cancelación, pausa, permisos por origen y límites de consultas. Las pruebas del controlador se ejecutan con `node --test tests/syscom.test.mjs`. Queda pendiente la prueba en Chrome instalado con el precio particular de la cuenta del distribuidor: el navegador conectado a esta conversación no dispone de esa sesión.

La selección del precio principal incluye pruebas con HTML ficticio que reproduce la tarjeta de compra: precio destacado, «+ IVA», lista/especial/desde, promociones, etiquetas fragmentadas, monedas, datos ocultos y casos ambiguos. Para ejecutar todas las pruebas de desarrollo, usa Node 22.7 o superior, `npm ci` y `npm test`; jsdom es una dependencia de prueba y la app sigue siendo un sitio estático sin compilación.

Se comprobó la importación de un archivo Excel con los importes de Cámaras — Tabachines, el total `$3.980,94`, la detección y corrección de diferencias, la vista previa y la descarga de ambos formatos. Una tabla de 30 conceptos se generó en Word y PDF y se revisó en sus 7 páginas. Se comprobó también la distribución de escritorio y de móvil de 390 px de ancho sin desbordamiento horizontal.

Se verificó la importación por enlace de la matriz de Videoportero y sus cinco conceptos desde «Cliente», el total sin IVA, y la diferencia producida por un precio calculado con decimales ocultos. Las pruebas de detección incluyen encabezados en la fila 76, columnas reordenadas, pestañas renombradas, alias de encabezados, encabezados repetidos, tablas múltiples, notas y valores inválidos. Las matrices de prueba permanecen fuera del repositorio y del paquete de publicación.

La conexión OAuth a hojas privadas queda pendiente de un ID de cliente de la empresa y de una prueba con su cuenta. Las dependencias y sus licencias están en `LICENSES.md`.
