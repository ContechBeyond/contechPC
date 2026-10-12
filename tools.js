// Register tools here. The portal builds its menu, cards and routes from this list.
// Existing document tools share one initializer; module imports run it only once.
// A new URL keeps the pre-portal bootstrap out of existing browser caches.
const loadDocumentTools=()=>import('./app.js?portal=1');

export const TOOLS=[
  {
    id:'proposal',slug:'propuesta-comercial',viewId:'proposal-view',headingId:'proposal-title',
    title:'Propuesta comercial',
    description:'Importa tus conceptos, completa los datos del proyecto y descarga la propuesta con el formato Contech.',
    formats:['Word','PDF'],
    icon:'<path d="M14 3H5v18h14V8Zm0 0v5h5M8 12h8M8 16h6"/>',
    load:loadDocumentTools
  },
  {
    id:'final-version',slug:'version-final',viewId:'vf-view',headingId:'vf-title',
    title:'Versión final',
    description:'Convierte una versión matriz en Excel y PDF VF, conservando los valores, las fórmulas y el formato.',
    badge:'VM → VF',formats:['Excel','PDF'],
    icon:'<path d="M14 3H5v18h14V8Zm0 0v5h5M8 12h8M8 16h8M11 11v7"/>',
    load:loadDocumentTools
  }
];
