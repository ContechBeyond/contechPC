import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const source=await readFile(new URL('../extensions/contech-syscom/dom-reader.js',import.meta.url),'utf8');

// Synthetic product data only. The price layout reproduces the supplied screenshot;
// CSS makes its visual hierarchy measurable without requiring a private session.
function fixture(t,pricing){
  const dom=new JSDOM(`<!doctype html><html><head><style>
    body{font-size:14px} .text-sm{font-size:14px}
    .text-4xl{font-size:36px;font-weight:700} .aux-large{font-size:56px;font-weight:700}
  </style></head><body><main>
    <div class="grid"><article>
      <h1>Equipo de demostración / Descripción de prueba</h1>
      <div><span>Modelo</span><span>DEMO-PRICE</span></div>
      <div><span>Marca</span><span>Marca de prueba</span></div>
    </article><aside>${pricing}</aside></div>
    <section><h2>Productos relacionados</h2><p class="aux-large">USD $9,999.99 sin IVA</p></section>
  </main></body></html>`,{url:'https://www.syscom.mx/products/1',runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  dom.window.eval(source);
  // Chrome messaging serializes these values out of the reader's isolated realm.
  return JSON.parse(JSON.stringify(dom.window.ContechSyscomDom.product(dom.window.document)));
}

function screenshot({main='USD $1,175.18',vat='+ IVA',extra='',fragmented=false}={}){
  return `<div class="price-card">
    ${fragmented
      ? '<p class="text-sm"><span>Precio de Lista:</span> <span><strong>USD $2,185.98</strong></span></p><p class="text-sm"><span>Precio especial:</span> <span><strong>USD $2,185.98</strong></span></p>'
      : '<p class="text-sm">Precio de Lista: USD $2,185.98</p><p class="text-sm">Precio especial: USD $2,185.98</p>'}
    <p class="text-4xl">${main}</p><p class="tax">${vat}</p>
  </div><div class="volume-offer"><span>Desde USD 1,057.66</span> <span>+10% de regreso</span></div>${extra}`;
}

function assertMain(product,amount=1175.18,currency='USD'){
  assert.equal(product.model,'DEMO-PRICE');
  assert.ok(product.price,'El precio principal neto debe seleccionarse automáticamente');
  assert.equal(product.price.unitCost,amount);
  assert.equal(product.price.currency,currency);
  assert.equal(product.price.withIVA,false);
  assert.deepEqual(product.priceChoices.map(choice=>choice.unitCost),[amount]);
}

test('selecciona el precio grande de compra y + IVA indica precio neto',t=>{
  assertMain(fixture(t,screenshot()));
});

test('no pierde las etiquetas de lista/especial ni la moneda en nodos fragmentados',t=>{
  const pricing=screenshot({fragmented:true,main:'<span>USD</span> <span><strong>$1,175.18</strong></span>',vat:'<span>+</span> <span>IVA</span>'});
  assertMain(fixture(t,pricing));
});

test('reconoce + IVA separado después del grupo de importe anidado',t=>{
  assertMain(fixture(t,'<div><div><p class="text-4xl"><span>USD $1,175.18</span></p></div><p>+&nbsp; IVA</p></div>'));
});

test('respeta moneda MXN explícita y separadores decimales locales',t=>{
  assertMain(fixture(t,'<div><p class="text-4xl">MXN $1.175,18</p><p>+ IVA</p></div>'),1175.18,'MXN');
});

for(const currency of ['USD','MXN']){
  test(`un importe con $ usa ${currency} solamente cuando está seleccionado en el control`,t=>{
    const other=currency==='USD'?'MXN':'USD';
    const control=`<label>Moneda<select><option>${other}</option><option selected>${currency}</option></select></label>`;
    assertMain(fixture(t,`${control}<div><p class="text-4xl">$1,175.18</p><p>+ IVA</p></div>`),1175.18,currency);
  });
}

test('un signo $ sin moneda explícita ni selección válida no se adivina',t=>{
  const product=fixture(t,'<div><p class="text-4xl">$1,175.18</p><p>+ IVA</p></div>');
  assert.equal(product.price,null);
});

test('no usa un control de moneda oculto para completar un signo $',t=>{
  const product=fixture(t,'<div hidden><button aria-pressed="true">USD</button></div><div><p class="text-4xl">$1,175.18</p><p>+ IVA</p></div>');
  assert.equal(product.price,null);
});

test('descarta ofertas auxiliares aunque su texto sea más grande que el principal',t=>{
  const extra=`<div class="aux-large"><span>Desde</span> <strong>USD $1,057.66</strong></div>
    <div class="aux-large"><span>Precio especial:</span> <strong>USD $2,185.98</strong></div>
    <div class="aux-large">USD $117.52 de regreso</div>
    <div class="aux-large">Ahorro USD $1,010.80</div>
    <div class="aux-large">Precio de mayoreo USD $1,000.00</div>
    <div class="aux-large">Envío USD $20.00</div>`;
  assertMain(fixture(t,screenshot({extra})));
});

test('ignora un principal oculto y descarta precios tachados por un ancestro',t=>{
  const extra='<div style="display:none"><p class="text-4xl">USD $8,000.00 sin IVA</p></div><div style="text-decoration-line:line-through"><strong class="aux-large">USD $7,000.00</strong></div><del>USD $6,000.00</del>';
  assertMain(fixture(t,screenshot({extra})));
});

test('deduplica el mismo precio principal en varios nodos visibles',t=>{
  const product=fixture(t,'<div><p class="text-4xl">USD $1,175.18 sin IVA</p></div><div><p class="text-4xl">USD $1,175.18 sin IVA</p></div>');
  assertMain(product);
});

test('dos precios principales de igual prominencia requieren revisión',t=>{
  const product=fixture(t,'<div><p class="text-4xl">USD $1,175.18 sin IVA</p></div><div><p class="text-4xl">USD $1,200.00 sin IVA</p></div>');
  assert.equal(product.price,null);
  assert.deepEqual(product.priceChoices.map(choice=>choice.unitCost).sort((a,b)=>a-b),[1175.18,1200]);
});

for(const [vat,expectedIVA] of [['IVA incluido',true],['',null]]){
  test(`un principal con IVA ${expectedIVA===true?'incluido':'desconocido'} no toma un precio secundario neto`,t=>{
    const product=fixture(t,screenshot({vat,extra:'<div><p class="text-sm">USD $999.00 sin IVA</p></div>'}));
    assert.equal(product.price,null);
    assert.deepEqual(product.priceChoices.map(choice=>choice.unitCost),[1175.18]);
    assert.equal(product.priceChoices[0].withIVA,expectedIVA);
  });
}

test('un principal sin IVA reconocido conserva toda la precisión del importe',t=>{
  assertMain(fixture(t,screenshot({main:'USD $1,175.180123',vat:'sin IVA'})),1175.180123);
});

test('mantiene el caso simple de un único precio neto sin tipografía destacada',t=>{
  assertMain(fixture(t,'<div><p>USD $1,175.18 sin IVA</p></div>'));
});

test('varios precios normales sin principal inequívoco permanecen en revisión',t=>{
  const product=fixture(t,'<div><p>USD $1,175.18 sin IVA</p></div><div><p>USD $1,200.00 sin IVA</p></div>');
  assert.equal(product.price,null);
  assert.deepEqual(product.priceChoices.map(choice=>choice.unitCost).sort((a,b)=>a-b),[1175.18,1200]);
});

test('el fallback no confunde precio especial ni desde con una tarifa de compra',t=>{
  const product=fixture(t,'<div><p>Precio especial: USD $2,185.98 sin IVA</p></div><div><p>Desde USD $1,057.66 sin IVA</p></div>');
  assert.equal(product.price,null);
  assert.deepEqual(product.priceChoices,[]);
});

test('un precio principal en un encabezado no se confunde con una sección de relacionados',t=>{
  assertMain(fixture(t,'<div><h3 class="text-4xl">USD $1,175.18</h3><p>+ IVA</p></div>'));
});

test('una moneda pendiente en el principal no se reemplaza por un precio secundario',t=>{
  const product=fixture(t,'<div><p class="text-4xl">$1,175.18</p><p>+ IVA</p></div><div><p>USD $999.00 sin IVA</p></div>');
  assert.equal(product.price,null);assert.deepEqual(product.priceChoices,[]);
});

test('una contradicción de IVA en el principal requiere revisión aunque el pie diga sin IVA',t=>{
  const product=fixture(t,'<div><p class="text-4xl">USD $1,175.18 sin IVA, con IVA</p></div><footer>Precios sin IVA</footer>');
  assert.equal(product.price,null);assert.equal(product.priceChoices[0].withIVA,null);
});
