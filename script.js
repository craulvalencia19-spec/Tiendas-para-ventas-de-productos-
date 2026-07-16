/* =========================================================
   CROSSPORT - lógica de la app (Firebase Firestore)
   Requiere que firebase-config.js esté cargado ANTES de este
   archivo y que la variable global `db` ya exista.
   ========================================================= */

let session = JSON.parse(sessionStorage.getItem('cp_session') || 'null');

/* ---------- NAVEGACIÓN ---------- */
function goTo(view, data){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  window.scrollTo({top:0, behavior:'smooth'});

  if(view === 'home') renderStoreList();
  if(view === 'dashboard') renderDashboard();
  if(view === 'shareStore') renderShare();
  if(view === 'store' && data) renderStoreFront(data);
}

function updateNav(){
  const logged = !!session;
  document.getElementById('btnMiTienda').style.display = logged ? 'inline-block' : 'none';
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
      empresa, nombre, ci, clave,
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

  const snap = await db.collection('tiendas').doc(session.ci).collection('productos')
    .orderBy('createdAt', 'desc').get();

  cont.innerHTML = '';
  if(snap.empty){
    cont.innerHTML = '<p style="color:var(--muted)">Aún no agregaste productos. Usa "+ Agregar producto".</p>';
    return;
  }
  snap.forEach(doc => cont.appendChild(productCard(doc.data())));
}

function productCard(p){
  const div = document.createElement('div');
  div.className = 'product-card';
  div.innerHTML = `
    <img src="${p.foto || 'https://via.placeholder.com/300x200?text=Sin+foto'}" alt="${p.nombre}">
    <div class="info">
      <h4>${p.nombre}</h4>
      <div class="price">Bs ${Number(p.precio).toFixed(2)}</div>
      <div class="meta">Tallas: ${(p.tallas || []).join(', ') || '-'}</div>
      <div class="meta">Colores: ${p.colores || '-'}</div>
    </div>
  `;
  return div;
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
    document.getElementById('pPreview').src = evt.target.result;
    document.getElementById('pPreview').style.display = 'block';
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

/* ---------- LISTA DE TIENDAS (home) ---------- */
async function renderStoreList(){
  const cont = document.getElementById('storeList');
  cont.innerHTML = '<p style="color:var(--muted); text-align:center; grid-column:1/-1;">Cargando...</p>';

  const snap = await db.collection('tiendas').orderBy('createdAt', 'desc').get();
  cont.innerHTML = '';
  if(snap.empty){
    cont.innerHTML = '<p style="color:var(--muted); text-align:center; grid-column:1/-1;">Todavía no hay tiendas creadas. ¡Sé el primero!</p>';
    return;
  }
  snap.forEach(doc => {
    const u = doc.data();
    const card = document.createElement('div');
    card.className = 'store-card';
    card.innerHTML = `<h3>${u.empresa}</h3><p>Ver catálogo</p>`;
    card.onclick = () => { window.history.pushState({}, '', '?tienda=' + u.ci); goTo('store', u.ci); };
    cont.appendChild(card);
  });
}

/* ---------- VISTA PÚBLICA DE TIENDA ---------- */
async function renderStoreFront(ci){
  const cont = document.getElementById('storeProducts');
  document.getElementById('storeNombre').textContent = '...';
  cont.innerHTML = '<p style="color:var(--muted); text-align:center; grid-column:1/-1;">Cargando...</p>';

  const userDoc = await db.collection('tiendas').doc(ci).get();
  if(!userDoc.exists){
    alert('Esta tienda no existe o el enlace no es válido.');
    goTo('home');
    return;
  }
  document.getElementById('storeNombre').textContent = userDoc.data().empresa;

  const snap = await db.collection('tiendas').doc(ci).collection('productos')
    .orderBy('createdAt', 'desc').get();

  cont.innerHTML = '';
  if(snap.empty){
    cont.innerHTML = '<p style="color:var(--muted); text-align:center; grid-column:1/-1;">Esta tienda todavía no tiene productos.</p>';
    return;
  }
  snap.forEach(doc => cont.appendChild(productCard(doc.data())));
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