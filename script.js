/* =========================================================
   CROSSPORT - lógica de la app (Firebase Firestore)
   Requiere que firebase-config.js esté cargado ANTES de este
   archivo y que la variable global `db` ya exista.
   ========================================================= */

let session = JSON.parse(sessionStorage.getItem('cp_session') || 'null');

// Carrito de la tienda que se está viendo actualmente (solo en memoria, por visita)
let currentStoreCI = null;
let currentStoreDeliveryEnabled = false;
let currentStorePagoQr = '';
let cart = []; // { id, nombre, precio, cantidad }

/* ---------- NAVEGACIÓN ---------- */
function goTo(view, data){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  window.scrollTo({top:0, behavior:'smooth'});

  // El botón flotante del carrito y de WhatsApp solo se muestran dentro de la tienda pública
  document.getElementById('cartFloat').style.display = (view === 'store') ? 'flex' : 'none';
  document.getElementById('whatsappFloat').style.display = (view === 'store') ? 'flex' : 'none';
  closeCart();

  if(view === 'home') renderStoreList();
  if(view === 'dashboard') renderDashboard();
  if(view === 'shareStore') renderShare();
  if(view === 'store' && data) renderStoreFront(data);
  if(view === 'checkout') renderCheckoutResumen();
  if(view === 'pedidos') renderPedidos();
  if(view === 'misPedidos') renderMisPedidos();
}

function updateNav(){
  const logged = !!session;
  document.getElementById('btnMiTienda').style.display = logged ? 'inline-block' : 'none';
  document.getElementById('btnPedidos').style.display = logged ? 'inline-block' : 'none';
  document.getElementById('btnLogout').style.display = logged ? 'inline-block' : 'none';
  document.getElementById('btnLogin').style.display = logged ? 'none' : 'inline-block';
}

function logout(){
  session = null;
  sessionStorage.removeItem('cp_session');
  updateNav();
  goTo('home');
}

/* ---------- REGISTRO ---------- */
document.getElementById('formRegister').addEventListener('submit', async function(e){
  e.preventDefault();
  const empresa = document.getElementById('regEmpresa').value.trim();
  const nombre = document.getElementById('regNombre').value.trim();
  const ci = document.getElementById('regCI').value.trim();
  const clave = document.getElementById('regClave').value;
  const whatsapp = document.getElementById('regWhatsapp').value.trim().replace(/\D/g, '');
  const direccion = document.getElementById('regDireccion').value.trim();

  const btn = this.querySelector('button');
  btn.disabled = true; btn.textContent = 'Creando...';

  try{
    const ref = db.collection('tiendas').doc(ci);
    const existing = await ref.get();
    if(existing.exists){
      alert('Ya existe una cuenta registrada con ese C.I.');
      return;
    }
    await ref.set({
      empresa, nombre, ci, clave, whatsapp, direccion,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Guardamos también una versión "liviana" (sin fotos pesadas) para que la
    // página de Inicio cargue rápido sin importar cuántas tiendas se sumen.
    await db.collection('tiendas_publicas').doc(ci).set({
      ci, empresa, logo: '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    session = { ci };
    sessionStorage.setItem('cp_session', JSON.stringify(session));
    updateNav();
    alert('Cuenta creada correctamente. Bienvenido/a, ' + nombre + '.');
    goTo('dashboard');
  } catch(err){
    console.error(err);
    alert('Error al crear la cuenta. Revisa tu conexión o la configuración de Firebase.');
  } finally {
    btn.disabled = false; btn.textContent = 'Crear cuenta';
  }
});

/* ---------- LOGIN ---------- */
document.getElementById('formLogin').addEventListener('submit', async function(e){
  e.preventDefault();
  const ci = document.getElementById('loginCI').value.trim();
  const clave = document.getElementById('loginClave').value;

  const btn = this.querySelector('button');
  btn.disabled = true; btn.textContent = 'Ingresando...';

  try{
    const doc = await db.collection('tiendas').doc(ci).get();
    if(!doc.exists || doc.data().clave !== clave){
      alert('C.I. o clave incorrectos.');
      return;
    }
    session = { ci };
    sessionStorage.setItem('cp_session', JSON.stringify(session));
    updateNav();
    goTo('dashboard');
  } catch(err){
    console.error(err);
    alert('Error al ingresar. Revisa tu conexión o la configuración de Firebase.');
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar';
  }
});

/* ---------- DASHBOARD ---------- */
async function renderDashboard(){
  if(!session){ goTo('login'); return; }
  const cont = document.getElementById('dashProducts');
  cont.innerHTML = '<p style="color:var(--muted)">Cargando...</p>';

  const userDoc = await db.collection('tiendas').doc(session.ci).get();
  if(!userDoc.exists){ logout(); return; }
  document.getElementById('dashEmpresaNombre').textContent = userDoc.data().empresa;
  document.getElementById('editWhatsapp').value = userDoc.data().whatsapp || '';
  document.getElementById('editDireccion').value = userDoc.data().direccion || '';
  document.getElementById('editDeliveryHabilitado').checked = !!userDoc.data().deliveryHabilitado;

  const logoGuardado = userDoc.data().logo;
  if(logoGuardado){
    document.getElementById('editLogoPreview').src = logoGuardado;
    document.getElementById('editLogoPreview').style.display = 'block';
  }

  const qrPagoGuardado = userDoc.data().qrPago;
  if(qrPagoGuardado){
    document.getElementById('pagoQrPreview').src = qrPagoGuardado;
    document.getElementById('pagoQrPreview').style.display = 'block';
  }

  const snap = await db.collection('tiendas').doc(session.ci).collection('productos')
    .orderBy('createdAt', 'desc').get();

  cont.innerHTML = '';
  if(snap.empty){
    cont.innerHTML = '<p style="color:var(--muted)">Aún no agregaste productos. Usa "+ Agregar producto".</p>';
    return;
  }
  snap.forEach(doc => cont.appendChild(productCard(doc.data(), doc.id, false)));
}

function productCard(p, id, isPublic){
  const div = document.createElement('div');
  div.className = 'product-card' + (p.agotado ? ' agotado' : '');
  div.innerHTML = `
    <img src="${p.foto || 'https://via.placeholder.com/300x200?text=Sin+foto'}" alt="${p.nombre}" class="product-img-clickable">
    <div class="info">
      <h4>${p.nombre} ${p.agotado ? '<span class="agotado-tag">AGOTADO</span>' : ''}</h4>
      <div class="price">Bs ${Number(p.precio).toFixed(2)}</div>
      <div class="meta">Tallas: ${(p.tallas || []).join(', ') || '-'}</div>
      <div class="meta">Colores: ${p.colores || '-'}</div>
      <button class="btn-neon small outline ver-img-btn">Ver imagen</button>
      ${isPublic
        ? (p.agotado
            ? `<button class="btn-neon small" disabled style="opacity:0.5; cursor:not-allowed;">Agotado</button>`
            : `<button class="btn-neon small add-cart-btn">Agregar al carrito</button>`)
        : `<button class="btn-neon small outline toggle-agotado-btn">${p.agotado ? 'Marcar disponible' : 'Marcar agotado'}</button>`
      }
    </div>
  `;
  const img = div.querySelector('.product-img-clickable');
  const imgSrc = p.foto || 'https://via.placeholder.com/300x200?text=Sin+foto';
  img.addEventListener('click', () => openImageModal(imgSrc));
  div.querySelector('.ver-img-btn').addEventListener('click', () => openImageModal(imgSrc));
  if(isPublic){
    if(!p.agotado){
      div.querySelector('.add-cart-btn').addEventListener('click', () => openTallaModal(id, p));
    }
  } else {
    div.querySelector('.toggle-agotado-btn').addEventListener('click', () => toggleAgotado(id, p.agotado));
  }
  return div;
}

async function toggleAgotado(id, estadoActual){
  if(!session) return;
  try{
    await db.collection('tiendas').doc(session.ci).collection('productos').doc(id)
      .update({ agotado: !estadoActual });
    renderDashboard();
  } catch(err){
    console.error(err);
    alert('Error al actualizar el producto.');
  }
}

function openImageModal(src){
  document.getElementById('imageModalImg').src = src;
  document.getElementById('imageModal').classList.add('open');
}
function closeImageModal(){
  document.getElementById('imageModal').classList.remove('open');
}

function mostrarQrPago(){
  if(!currentStorePagoQr){
    alert('Esta tienda todavía no configuró un QR de pago. Contáctala por WhatsApp para coordinar el pago.');
    return;
  }
  openImageModal(currentStorePagoQr);
}

/* ---------- AGREGAR PRODUCTO ---------- */
document.querySelectorAll('#pTallas .chip').forEach(chip => {
  chip.addEventListener('click', () => chip.classList.toggle('active'));
});

document.getElementById('pFoto').addEventListener('change', function(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    const img = new Image();
    img.onload = () => {
      // Redimensionamos la imagen para que no sea demasiado pesada (límite de Firestore: 1MB por documento)
      const maxWidth = 700;
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const compressed = canvas.toDataURL('image/jpeg', 0.7);

      document.getElementById('pPreview').src = compressed;
      document.getElementById('pPreview').style.display = 'block';
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
});

document.getElementById('formProduct').addEventListener('submit', async function(e){
  e.preventDefault();
  if(!session){ goTo('login'); return; }

  const tallas = Array.from(document.querySelectorAll('#pTallas .chip.active')).map(c => c.dataset.val);
  const fotoEl = document.getElementById('pPreview');

  const product = {
    nombre: document.getElementById('pNombre').value.trim(),
    material: document.getElementById('pMaterial').value.trim(),
    tallas,
    colores: document.getElementById('pColores').value.trim(),
    precio: document.getElementById('pPrecio').value,
    descripcion: document.getElementById('pDescripcion').value.trim(),
    foto: fotoEl.style.display === 'block' ? fotoEl.src : '',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  const btn = this.querySelector('button');
  btn.disabled = true; btn.textContent = 'Guardando...';

  try{
    // Firestore tiene un límite de 1MB por documento: usa fotos livianas (comprimidas).
    await db.collection('tiendas').doc(session.ci).collection('productos').add(product);

    this.reset();
    document.querySelectorAll('#pTallas .chip').forEach(c => c.classList.remove('active'));
    document.getElementById('pPreview').style.display = 'none';

    alert('Producto guardado.');
    goTo('dashboard');
  } catch(err){
    console.error(err);
    alert('Error al guardar el producto. Si subiste una foto muy grande, prueba con una más liviana.');
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar producto';
  }
});

/* ---------- LOGO DE LA TIENDA ---------- */
document.getElementById('editLogoFoto').addEventListener('change', function(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    const img = new Image();
    img.onload = () => {
      const maxWidth = 300;
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const compressed = canvas.toDataURL('image/png');
      document.getElementById('editLogoPreview').src = compressed;
      document.getElementById('editLogoPreview').style.display = 'block';
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
});

/* ---------- EDITAR DATOS DE CONTACTO (whatsapp, dirección, logo) ---------- */
document.getElementById('btnGuardarDatosTienda').addEventListener('click', async function(){
  if(!session) return;
  const whatsapp = document.getElementById('editWhatsapp').value.trim().replace(/\D/g, '');
  const direccion = document.getElementById('editDireccion').value.trim();
  const deliveryHabilitado = document.getElementById('editDeliveryHabilitado').checked;
  const logoPreview = document.getElementById('editLogoPreview');
  const logo = logoPreview.style.display === 'block' ? logoPreview.src : '';

  if(whatsapp === ''){
    alert('Debes ingresar un número de WhatsApp para que tus clientes puedan contactarte.');
    return;
  }

  this.disabled = true; this.textContent = 'Guardando...';
  try{
    const datos = { whatsapp, direccion, deliveryHabilitado };
    if(logo) datos.logo = logo;
    await db.collection('tiendas').doc(session.ci).update(datos);

    // Actualizamos siempre la versión liviana (con o sin logo), para que
    // esta tienda aparezca en la lista de Inicio.
    const empresaDoc = await db.collection('tiendas').doc(session.ci).get();
    await db.collection('tiendas_publicas').doc(session.ci).set({
      ci: session.ci,
      empresa: empresaDoc.data().empresa,
      logo: logo || empresaDoc.data().logo || '',
      createdAt: empresaDoc.data().createdAt || firebase.firestore.FieldValue.serverTimestamp()
    });

    alert('Datos guardados correctamente.');
  } catch(err){
    console.error(err);
    alert('Error al guardar los datos.');
  } finally {
    this.disabled = false; this.textContent = 'Guardar datos';
  }
});

/* ---------- ELIMINAR CUENTA (zona de peligro, solo el anfitrión) ---------- */
document.getElementById('btnEliminarCuenta').addEventListener('click', async function(){
  if(!session) return;
  const confirmacion = prompt('Esto borrará tu tienda para siempre. Escribe ELIMINAR para confirmar:');
  if(confirmacion !== 'ELIMINAR'){
    return;
  }

  this.disabled = true; this.textContent = 'Eliminando...';
  try{
    const ci = session.ci;

    // Borramos los productos
    const productosSnap = await db.collection('tiendas').doc(ci).collection('productos').get();
    await Promise.all(productosSnap.docs.map(d => d.ref.delete()));

    // Borramos los pedidos
    const pedidosSnap = await db.collection('tiendas').doc(ci).collection('pedidos').get();
    await Promise.all(pedidosSnap.docs.map(d => d.ref.delete()));

    // Borramos la tienda
    await db.collection('tiendas').doc(ci).delete();

    // Borramos también su versión liviana de la lista de Inicio
    await db.collection('tiendas_publicas').doc(ci).delete();

    alert('Tu cuenta y tu tienda fueron eliminadas.');
    logout();
  } catch(err){
    console.error(err);
    alert('Error al eliminar la cuenta.');
    this.disabled = false; this.textContent = 'Eliminar cuenta';
  }
});

/* ---------- QR DE PAGO (dashboard del anfitrión) ---------- */
document.getElementById('pagoQrFoto').addEventListener('change', function(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    const img = new Image();
    img.onload = () => {
      const maxWidth = 500;
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const compressed = canvas.toDataURL('image/png');
      document.getElementById('pagoQrPreview').src = compressed;
      document.getElementById('pagoQrPreview').style.display = 'block';
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
});

document.getElementById('btnGuardarQrPago').addEventListener('click', async function(){
  if(!session) return;
  const preview = document.getElementById('pagoQrPreview');
  if(preview.style.display !== 'block'){
    alert('Primero selecciona una imagen de tu QR de pago.');
    return;
  }
  this.disabled = true; this.textContent = 'Guardando...';
  try{
    await db.collection('tiendas').doc(session.ci).update({ qrPago: preview.src });
    alert('QR de pago guardado. Ya aparece en tu tienda.');
  } catch(err){
    console.error(err);
    alert('Error al guardar el QR de pago.');
  } finally {
    this.disabled = false; this.textContent = 'Guardar QR de pago';
  }
});

/* ---------- COMPARTIR / QR ---------- */
function renderShare(){
  if(!session){ goTo('login'); return; }
  const link = window.location.origin + window.location.pathname + '?tienda=' + session.ci;
  document.getElementById('shareLink').value = link;

  const qrDiv = document.getElementById('qrcode');
  qrDiv.innerHTML = '';
  if(window.QRCode){
    new QRCode(qrDiv, { text: link, width: 200, height: 200 });
  } else {
    qrDiv.textContent = 'No se pudo cargar el generador de QR (revisa tu conexión a internet).';
  }
}

function copyLink(){
  const input = document.getElementById('shareLink');
  input.select();
  document.execCommand('copy');
  alert('Enlace copiado.');
}

/* ---------- LISTA DE TIENDAS (home) con buscador ---------- */
let todasLasTiendas = []; // cache en memoria para filtrar sin volver a consultar Firebase
let searchMode = 'nombre'; // 'nombre' o 'numero'

async function renderStoreList(){
  const cont = document.getElementById('storeList');
  cont.innerHTML = '<p style="color:var(--muted); text-align:center; grid-column:1/-1;">Cargando...</p>';

  const snap = await db.collection('tiendas_publicas').orderBy('createdAt', 'desc').get();
  todasLasTiendas = [];
  snap.forEach(doc => todasLasTiendas.push(doc.data()));
  // Le damos un número fijo a cada una según el orden en que se crearon (más antigua = 1)
  const ordenAscendente = [...todasLasTiendas].reverse();
  ordenAscendente.forEach((u, i) => { u.numero = i + 1; });

  document.getElementById('searchStoreInput').value = '';
  pintarListaTiendas(todasLasTiendas);
}

function pintarListaTiendas(lista){
  const cont = document.getElementById('storeList');
  cont.innerHTML = '';
  if(lista.length === 0){
    cont.innerHTML = '<p style="color:var(--muted); text-align:center; grid-column:1/-1;">No se encontraron tiendas.</p>';
    return;
  }
  lista.forEach(u => {
    const card = document.createElement('div');
    card.className = 'store-card';
    card.innerHTML = `
      <div class="store-card-num">#${u.numero}</div>
      ${u.logo ? `<img src="${u.logo}" class="store-card-logo" alt="${u.empresa}">` : ''}
      <h3>${u.empresa}</h3>
      <p>Ver catálogo</p>
    `;
    card.onclick = () => { window.history.pushState({}, '', '?tienda=' + u.ci); goTo('store', u.ci); };
    cont.appendChild(card);
  });
}

document.querySelectorAll('#searchModeOptions .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#searchModeOptions .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    searchMode = chip.dataset.val;
    const input = document.getElementById('searchStoreInput');
    input.placeholder = searchMode === 'nombre'
      ? 'Escribe el nombre de la empresa...'
      : 'Escribe el número de la tienda...';
    input.value = '';
    pintarListaTiendas(todasLasTiendas);
  });
});

document.getElementById('searchStoreInput').addEventListener('input', function(){
  const texto = this.value.trim().toLowerCase();
  if(texto === ''){
    pintarListaTiendas(todasLasTiendas);
    return;
  }
  let filtradas;
  if(searchMode === 'numero'){
    filtradas = todasLasTiendas.filter(u => String(u.numero).includes(texto));
  } else {
    filtradas = todasLasTiendas.filter(u => u.empresa.toLowerCase().includes(texto));
  }
  pintarListaTiendas(filtradas);
});

/* ---------- VISTA PÚBLICA DE TIENDA ---------- */
async function renderStoreFront(ci){
  const cont = document.getElementById('storeProducts');
  document.getElementById('storeNombre').textContent = '...';
  cont.innerHTML = '<p style="color:var(--muted); text-align:center; grid-column:1/-1;">Cargando...</p>';

  // Pedimos los datos de la tienda Y los productos AL MISMO TIEMPO (antes se pedían uno después del otro, tardaba el doble)
  const [userDoc, snap] = await Promise.all([
    db.collection('tiendas').doc(ci).get(),
    db.collection('tiendas').doc(ci).collection('productos').orderBy('createdAt', 'desc').get()
  ]);

  if(!userDoc.exists){
    alert('Esta tienda no existe o el enlace no es válido.');
    goTo('home');
    return;
  }
  document.getElementById('storeNombre').textContent = userDoc.data().empresa;

  const logoEl = document.getElementById('storeLogoImg');
  if(userDoc.data().logo){
    logoEl.src = userDoc.data().logo;
    logoEl.style.display = 'block';
  } else {
    logoEl.style.display = 'none';
  }

  // Botón flotante de WhatsApp: usa el número propio de ESTA tienda (no se cruza con otras)
  const waFloat = document.getElementById('whatsappFloat');
  const storeWhatsapp = userDoc.data().whatsapp || '';
  if(storeWhatsapp){
    waFloat.href = `https://wa.me/${storeWhatsapp}?text=${encodeURIComponent('Hola, quiero más información sobre sus productos.')}`;
    waFloat.style.display = 'flex';
  } else {
    waFloat.style.display = 'none';
  }

  // Teléfono y direcciones de venta, visibles para el cliente
  const infoCont = document.getElementById('storeInfoExtra');
  const direccion = userDoc.data().direccion || '';
  infoCont.innerHTML = `
    ${storeWhatsapp ? `<div class="store-info-line">📞 ${storeWhatsapp}</div>` : ''}
    ${direccion ? `<div class="store-info-line">📍 ${direccion}</div>` : ''}
  `;

  // Método de pago por QR (si el anfitrión lo configuró)
  const qrPago = userDoc.data().qrPago || '';
  currentStorePagoQr = qrPago;
  const pagoBox = document.getElementById('storePagoQr');
  if(qrPago){
    document.getElementById('storePagoQrImg').src = qrPago;
    pagoBox.style.display = 'block';
  } else {
    pagoBox.style.display = 'none';
  }

  // Si cambiamos de tienda, vaciamos el carrito anterior
  if(currentStoreCI !== ci){ cart = []; currentStoreCI = ci; }
  currentStoreDeliveryEnabled = !!userDoc.data().deliveryHabilitado;
  updateCartUI();

  cont.innerHTML = '';
  if(snap.empty){
    cont.innerHTML = '<p style="color:var(--muted); text-align:center; grid-column:1/-1;">Esta tienda todavía no tiene productos.</p>';
    return;
  }
  snap.forEach(doc => cont.appendChild(productCard(doc.data(), doc.id, true)));
}

/* =========================================================
   CARRITO DE COMPRAS
   ========================================================= */
/* =========================================================
   CARRITO DE COMPRAS (con talla obligatoria)
   ========================================================= */
let pendingTallaProduct = null; // { id, p }

function openTallaModal(id, p){
  const tallas = p.tallas || [];
  if(tallas.length === 0){
    // Si el producto no tiene tallas cargadas, se agrega directo
    addToCart(id, p, '-');
    return;
  }
  pendingTallaProduct = { id, p };
  const optionsCont = document.getElementById('tallaOptions');
  optionsCont.innerHTML = tallas.map(t => `<span class="chip" data-val="${t}">${t}</span>`).join('');
  optionsCont.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      optionsCont.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });
  document.getElementById('tallaModal').classList.add('open');
}

function cancelTallaModal(){
  pendingTallaProduct = null;
  document.getElementById('tallaModal').classList.remove('open');
}

function confirmTallaModal(){
  const selected = document.querySelector('#tallaOptions .chip.active');
  if(!selected){
    alert('Debes elegir una talla para continuar.');
    return;
  }
  const talla = selected.dataset.val;
  addToCart(pendingTallaProduct.id, pendingTallaProduct.p, talla);
  pendingTallaProduct = null;
  document.getElementById('tallaModal').classList.remove('open');
}

function addToCart(id, p, talla){
  // Cada combinación producto + talla es una línea distinta en el carrito
  const key = id + '|' + talla;
  const existing = cart.find(it => it.key === key);
  if(existing){
    existing.cantidad += 1;
  } else {
    cart.push({ key, id, talla, nombre: p.nombre, precio: Number(p.precio), cantidad: 1 });
  }
  updateCartUI();
}

function increaseQty(key){
  const item = cart.find(it => it.key === key);
  if(item){ item.cantidad += 1; updateCartUI(); }
}

function decreaseQty(key){
  const item = cart.find(it => it.key === key);
  if(!item) return;
  item.cantidad -= 1;
  if(item.cantidad <= 0){
    cart = cart.filter(it => it.key !== key);
  }
  updateCartUI();
}

let pendingRemoveKey = null;

function removeFromCart(key){
  pendingRemoveKey = key;
  document.getElementById('removeReasonInput').value = '';
  document.getElementById('removeModal').classList.add('open');
}

function cancelRemoveFromCart(){
  pendingRemoveKey = null;
  document.getElementById('removeModal').classList.remove('open');
}

function confirmRemoveFromCart(){
  // El comentario ya es opcional, no bloquea la acción.
  cart = cart.filter(it => it.key !== pendingRemoveKey);
  pendingRemoveKey = null;
  document.getElementById('removeModal').classList.remove('open');
  updateCartUI();
}

function cartTotal(){
  return cart.reduce((sum, it) => sum + it.precio * it.cantidad, 0);
}

function updateCartUI(){
  const count = cart.reduce((s, it) => s + it.cantidad, 0);
  document.getElementById('cartCount').textContent = count;
  document.getElementById('cartTotal').textContent = 'Bs ' + cartTotal().toFixed(2);
  document.getElementById('cartTotalBig').textContent = 'Bs ' + cartTotal().toFixed(2);

  const itemsCont = document.getElementById('cartItems');
  itemsCont.innerHTML = '';
  if(cart.length === 0){
    itemsCont.innerHTML = '<p style="color:var(--muted)">Tu carrito está vacío.</p>';
    return;
  }
  cart.forEach((it, index) => {
    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = `
      <div>
        <div class="cart-item-name">${index + 1}. ${it.nombre} ${it.talla !== '-' ? '(Talla ' + it.talla + ')' : ''}</div>
        <div class="cart-item-meta">Bs ${(it.precio*it.cantidad).toFixed(2)}</div>
        <div class="qty-controls">
          <button class="qty-btn qty-minus">−</button>
          <span class="qty-value">${it.cantidad}</span>
          <button class="qty-btn qty-plus">+</button>
        </div>
      </div>
      <button class="cart-remove-btn" title="Quitar del carrito">✕</button>
    `;
    row.querySelector('.qty-minus').addEventListener('click', () => decreaseQty(it.key));
    row.querySelector('.qty-plus').addEventListener('click', () => increaseQty(it.key));
    row.querySelector('.cart-remove-btn').addEventListener('click', () => removeFromCart(it.key));
    itemsCont.appendChild(row);
  });
}

function toggleCart(){
  document.getElementById('cartPanel').classList.toggle('open');
  document.getElementById('cartOverlay').classList.toggle('open');
}
function closeCart(){
  document.getElementById('cartPanel').classList.remove('open');
  document.getElementById('cartOverlay').classList.remove('open');
}

function goToCheckout(){
  if(cart.length === 0){
    alert('Tu carrito está vacío. Agrega algún producto primero.');
    return;
  }
  closeCart();

  // Si el anfitrión de esta tienda no activó el delivery, solo se ofrece "Recojo en tienda"
  const entregaBox = document.getElementById('entregaOptions');
  const deliveryChip = entregaBox.querySelector('[data-val="delivery"]');
  const recojoChip = entregaBox.querySelector('[data-val="recojo"]');
  if(currentStoreDeliveryEnabled){
    deliveryChip.style.display = 'inline-block';
  } else {
    deliveryChip.style.display = 'none';
    deliveryChip.classList.remove('active');
    recojoChip.classList.add('active');
    tipoEntregaSeleccionado = 'recojo';
    document.getElementById('direccionEntregaBox').style.display = 'none';
  }

  goTo('checkout');
}

function renderCheckoutResumen(){
  const cont = document.getElementById('checkoutResumen');
  cont.innerHTML = '<h4>Resumen del pedido</h4>' + cart.map(it =>
    `<div class="cart-item-meta">${it.cantidad} x ${it.nombre} ${it.talla !== '-' ? '(Talla ' + it.talla + ')' : ''} — Bs ${(it.precio*it.cantidad).toFixed(2)}</div>`
  ).join('') + `<div class="checkout-total">Total: Bs ${cartTotal().toFixed(2)}</div>`;
}

/* ---------- TIPO DE ENTREGA (recojo o delivery) ---------- */
let tipoEntregaSeleccionado = 'recojo';
let ubicacionCliente = null; // { lat, lng }

document.getElementById('btnCompartirUbicacion').addEventListener('click', function(){
  if(!navigator.geolocation){
    document.getElementById('ubicacionStatus').textContent = 'Tu navegador no permite compartir ubicación.';
    return;
  }
  this.disabled = true; this.textContent = 'Obteniendo ubicación...';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      ubicacionCliente = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      document.getElementById('ubicacionStatus').textContent = '✓ Ubicación compartida correctamente.';
      this.disabled = false; this.textContent = '📍 Compartir mi ubicación';
    },
    () => {
      document.getElementById('ubicacionStatus').textContent = 'No se pudo obtener tu ubicación. Puedes seguir sin ella.';
      this.disabled = false; this.textContent = '📍 Compartir mi ubicación';
    }
  );
});

document.querySelectorAll('#entregaOptions .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#entregaOptions .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    tipoEntregaSeleccionado = chip.dataset.val;
    document.getElementById('direccionEntregaBox').style.display =
      tipoEntregaSeleccionado === 'delivery' ? 'block' : 'none';
  });
});

/* ---------- CONFIRMAR PEDIDO (checkout) ---------- */
document.getElementById('formCheckout').addEventListener('submit', async function(e){
  e.preventDefault();
  if(!currentStoreCI){ goTo('home'); return; }

  const cliNombre = document.getElementById('cliNombre').value.trim();
  const cliTelefono = document.getElementById('cliTelefono').value.trim().replace(/\D/g, '');
  const cliGmail = document.getElementById('cliGmail').value.trim();
  const cliDireccion = document.getElementById('cliDireccion').value.trim();
  const cliNombreReceptor = document.getElementById('cliNombreReceptor').value.trim();

  if(tipoEntregaSeleccionado === 'delivery' && cliDireccion === ''){
    alert('Debes escribir la dirección de entrega para el delivery.');
    return;
  }

  const pedido = {
    clienteNombre: cliNombre,
    clienteTelefono: cliTelefono,
    clienteGmail: cliGmail,
    tipoEntrega: tipoEntregaSeleccionado,
    direccionEntrega: tipoEntregaSeleccionado === 'delivery' ? cliDireccion : '',
    nombreReceptor: tipoEntregaSeleccionado === 'delivery' ? cliNombreReceptor : '',
    ubicacion: tipoEntregaSeleccionado === 'delivery' ? ubicacionCliente : null,
    items: cart.map(it => ({ nombre: it.nombre, cantidad: it.cantidad, precio: it.precio, talla: it.talla })),
    total: cartTotal(),
    estado: 'nuevo',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  const btn = this.querySelector('button');
  btn.disabled = true; btn.textContent = 'Enviando...';

  try{
    const docRef = await db.collection('tiendas').doc(currentStoreCI).collection('pedidos').add(pedido);

    // Guardamos localmente el ID de este pedido para que el cliente pueda verlo luego en "Mis pedidos"
    const key = 'cp_my_orders_' + currentStoreCI;
    const misOrdenes = JSON.parse(localStorage.getItem(key) || '[]');
    misOrdenes.push(docRef.id);
    localStorage.setItem(key, JSON.stringify(misOrdenes));

    // Preparamos el botón de WhatsApp hacia la tienda
    const tiendaDoc = await db.collection('tiendas').doc(currentStoreCI).get();
    const whatsapp = (tiendaDoc.data() || {}).whatsapp || '';
    const resumenTexto = cart.map(it => `${it.cantidad}x ${it.nombre}`).join(', ');
    const mensaje = encodeURIComponent(
      `Hola, soy ${cliNombre}. Quiero confirmar mi pedido: ${resumenTexto}. Total: Bs ${cartTotal().toFixed(2)}`
    );
    const link = document.getElementById('btnWhatsappTienda');
    if(whatsapp){
      link.href = `https://wa.me/${whatsapp}?text=${mensaje}`;
      link.style.display = 'inline-block';
    } else {
      link.style.display = 'none';
    }

    cart = [];
    updateCartUI();
    this.reset();
    tipoEntregaSeleccionado = 'recojo';
    ubicacionCliente = null;
    document.getElementById('ubicacionStatus').textContent = '';
    document.querySelectorAll('#entregaOptions .chip').forEach((c, i) => c.classList.toggle('active', i === 0));
    document.getElementById('direccionEntregaBox').style.display = 'none';
    goTo('orderDone');
  } catch(err){
    console.error(err);
    alert('Error al enviar el pedido. Intenta de nuevo.');
  } finally {
    btn.disabled = false; btn.textContent = 'Confirmar pedido';
  }
});

/* =========================================================
   MIS PEDIDOS (vista del cliente que compró, lista 1)
   Cada visitante guarda en su propio navegador (localStorage)
   los IDs de sus pedidos, y aquí consulta su estado real
   directo desde Firebase. No cruza con otros clientes ni
   con otras tiendas, porque la clave usa el C.I. de la tienda.
   ========================================================= */
async function renderMisPedidos(){
  const cont = document.getElementById('misPedidosList');
  if(!currentStoreCI){ cont.innerHTML = ''; return; }

  const key = 'cp_my_orders_' + currentStoreCI;
  const misIds = JSON.parse(localStorage.getItem(key) || '[]');

  if(misIds.length === 0){
    cont.innerHTML = '<p style="color:var(--muted)">Todavía no hiciste ningún pedido en esta tienda.</p>';
    return;
  }

  cont.innerHTML = '<p style="color:var(--muted)">Cargando...</p>';
  const tiendaDoc = await db.collection('tiendas').doc(currentStoreCI).get();
  const storeWhatsapp = (tiendaDoc.data() || {}).whatsapp || '';

  const pedidosDocs = await Promise.all(
    misIds.map(id => db.collection('tiendas').doc(currentStoreCI).collection('pedidos').doc(id).get())
  );

  cont.innerHTML = '';
  let algunoValido = false;
  let contador = 0;
  pedidosDocs.forEach(doc => {
    if(!doc.exists) return;
    algunoValido = true;
    contador++;
    const p = doc.data();
    const card = document.createElement('div');
    card.className = 'pedido-card' + (p.estado === 'visto' ? ' visto' : '');
    card.innerHTML = `
      <div class="pedido-info">
        <h4>#${contador} — Pedido <span class="pedido-estado">${p.estado === 'visto' ? '✓ Visto por la tienda' : '● En espera'}</span></h4>
        <div class="pedido-items">${(p.items||[]).map(it => `${it.cantidad}x ${it.nombre}${it.talla && it.talla !== '-' ? ' (Talla ' + it.talla + ')' : ''}`).join(', ')}</div>
        <div class="meta">${p.tipoEntrega === 'delivery' ? '🛵 Delivery: ' + (p.direccionEntrega || '-') : '🏬 Recojo en tienda'}</div>
        <div class="price">Total: Bs ${Number(p.total).toFixed(2)}</div>
      </div>
      <div class="pedido-actions">
        <a class="btn-neon small btn-wa" target="_blank">Llamar al anfitrión (WhatsApp)</a>
      </div>
    `;
    if(storeWhatsapp){
      const mensaje = encodeURIComponent(`Hola, soy ${p.clienteNombre}, quiero consultar sobre mi pedido.`);
      card.querySelector('.btn-wa').href = `https://wa.me/${storeWhatsapp}?text=${mensaje}`;
    } else {
      card.querySelector('.btn-wa').style.display = 'none';
    }
    cont.appendChild(card);
  });

  if(!algunoValido){
    cont.innerHTML = '<p style="color:var(--muted)">Todavía no hiciste ningún pedido en esta tienda.</p>';
  }
}

/* =========================================================
   PEDIDOS (vista del anfitrión/dueño de la tienda)
   ========================================================= */
async function renderPedidos(){
  if(!session){ goTo('login'); return; }
  const cont = document.getElementById('pedidosList');
  cont.innerHTML = '<p style="color:var(--muted)">Cargando...</p>';

  const snap = await db.collection('tiendas').doc(session.ci).collection('pedidos')
    .orderBy('createdAt', 'desc').get();

  cont.innerHTML = '';
  if(snap.empty){
    cont.innerHTML = '<p style="color:var(--muted)">Todavía no recibiste pedidos.</p>';
    return;
  }
  let numero = 0;
  snap.forEach((doc) => {
    numero++;
    const p = doc.data();
    const card = document.createElement('div');
    card.className = 'pedido-card';
    card.innerHTML = `
      <div class="pedido-num">${numero}</div>
      <div class="pedido-info">
        <h4>${p.clienteNombre}</h4>
        ${p.clienteGmail ? `<div class="meta">${p.clienteGmail}</div>` : ''}
        <div class="meta">📱 ${p.clienteTelefono || '-'}</div>
        <div class="pedido-items">${(p.items||[]).map(it => `${it.cantidad}x ${it.nombre}${it.talla ? ' (Talla ' + it.talla + ')' : ''}`).join(', ')}</div>
        <div class="meta">${p.tipoEntrega === 'delivery' ? '🛵 Delivery a domicilio: ' + (p.direccionEntrega || '-') : '🏬 Recojo en tienda'}</div>
        ${p.tipoEntrega === 'delivery' && p.nombreReceptor ? `<div class="meta">Recibe: ${p.nombreReceptor}</div>` : ''}
        ${p.tipoEntrega === 'delivery' && p.ubicacion ? `<a class="meta" style="color:var(--cyan)" href="https://www.google.com/maps?q=${p.ubicacion.lat},${p.ubicacion.lng}" target="_blank">📍 Ver ubicación en el mapa</a>` : ''}
        <div class="price">Total: Bs ${Number(p.total).toFixed(2)}</div>
      </div>
      <div class="pedido-actions">
        <span class="estado-pill ${p.estado === 'visto' ? 'visto' : 'nuevo'}">${p.estado === 'visto' ? 'Visto' : 'Nuevo'}</span>
        <button class="btn-toggle-visto">${p.estado === 'visto' ? 'Ocultar' : 'Marcar visto'}</button>
        <a class="btn-contactar" target="_blank">Contactar</a>
      </div>
    `;
    if(p.clienteTelefono){
      card.querySelector('.btn-contactar').href = `https://wa.me/${p.clienteTelefono}`;
    } else {
      card.querySelector('.btn-contactar').style.display = 'none';
    }
    card.querySelector('.btn-toggle-visto').addEventListener('click', async () => {
      const nuevoEstado = p.estado === 'visto' ? 'nuevo' : 'visto';
      await db.collection('tiendas').doc(session.ci).collection('pedidos').doc(doc.id)
        .update({ estado: nuevoEstado });
      renderPedidos();
    });
    cont.appendChild(card);
  });
}

/* ---------- INICIO: revisar si viene un link de tienda ---------- */
window.addEventListener('DOMContentLoaded', () => {
  updateNav();
  const params = new URLSearchParams(window.location.search);
  const ci = params.get('tienda');
  if(ci){
    goTo('store', ci);
  } else {
    goTo('home');
  }
  startFallingClothes();
});

/* =========================================================
   ANIMACIÓN DE FONDO: ropa cayendo (canvas, neon)
   ========================================================= */
function startFallingClothes(){
  const canvas = document.getElementById('fx');
  const ctx = canvas.getContext('2d');
  let w, h;

  function resize(){
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const colors = ['#ff2fd0', '#00fff2', '#7b2fff', '#f6ff2f'];
  const shapes = ['tshirt', 'pants', 'dress'];

  function drawShirt(x, y, size, color){
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size/40, size/40);
    ctx.beginPath();
    ctx.moveTo(-15,-18); ctx.lineTo(-6,-18); ctx.lineTo(0,-12); ctx.lineTo(6,-18);
    ctx.lineTo(15,-18); ctx.lineTo(20,-8); ctx.lineTo(12,-4); ctx.lineTo(12,18);
    ctx.lineTo(-12,18); ctx.lineTo(-12,-4); ctx.lineTo(-20,-8); ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();
  }

  function drawPants(x, y, size, color){
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size/40, size/40);
    ctx.beginPath();
    ctx.moveTo(-14,-18); ctx.lineTo(14,-18); ctx.lineTo(14,-8);
    ctx.lineTo(4,-8); ctx.lineTo(6,18); ctx.lineTo(-2,18); ctx.lineTo(-4,-8);
    ctx.lineTo(-14,-8); ctx.closePath();
    ctx.moveTo(-4,-8); ctx.lineTo(-14,18); ctx.lineTo(-6,18); ctx.lineTo(-2,-8);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();
  }

  function drawDress(x, y, size, color){
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size/40, size/40);
    ctx.beginPath();
    ctx.moveTo(-8,-18); ctx.lineTo(8,-18); ctx.lineTo(10,-10);
    ctx.lineTo(18,18); ctx.lineTo(-18,18); ctx.lineTo(-10,-10); ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();
  }

  const drawers = { tshirt: drawShirt, pants: drawPants, dress: drawDress };

  const count = Math.floor((window.innerWidth * window.innerHeight) / 45000);
  const items = [];
  for(let i=0;i<count;i++){
    items.push({
      x: Math.random()*w,
      y: Math.random()*h,
      size: 24 + Math.random()*26,
      speed: 0.4 + Math.random()*1.2,
      rot: Math.random()*Math.PI*2,
      rotSpeed: (Math.random()-0.5)*0.02,
      color: colors[Math.floor(Math.random()*colors.length)],
      shape: shapes[Math.floor(Math.random()*shapes.length)],
      drift: (Math.random()-0.5)*0.6,
      opacity: 0.15 + Math.random()*0.35
    });
  }

  function tick(){
    ctx.clearRect(0,0,w,h);
    items.forEach(it => {
      ctx.save();
      ctx.globalAlpha = it.opacity;
      ctx.translate(it.x, it.y);
      ctx.rotate(it.rot);
      ctx.translate(-it.x, -it.y);
      drawers[it.shape](it.x, it.y, it.size, it.color);
      ctx.restore();

      it.y += it.speed;
      it.x += it.drift;
      it.rot += it.rotSpeed;

      if(it.y - it.size > h){ it.y = -it.size; it.x = Math.random()*w; }
      if(it.x < -50) it.x = w+50;
      if(it.x > w+50) it.x = -50;
    });
    requestAnimationFrame(tick);
  }
  tick();
}