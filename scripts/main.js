// ---------- Datos ----------
const ADMIN = { usuario: 'admin', clave: 'admin123' };

let db = { usuarios: [], pedidos: [] };
try { db = JSON.parse(localStorage.getItem('catering')) || db; } catch (e) { }
const guardar = () => { try { localStorage.setItem('catering', JSON.stringify(db)); } catch (e) { } };

// ---------- Estado ----------
let user = null;       // { rol, nombre, email, tel }
let borrador = {};     // datos del evento mientras se llena el formulario
let pedidoId = null;   // pedido que se está viendo o cotizando
let editando = false;

// ---------- Utilidades ----------
const $ = id => document.getElementById(id);
const valor = id => $(id).value.trim();
const soles = n => 'S/ ' + n.toFixed(2);
const numero = id => 'N° ' + String(id).padStart(3, '0');
const buscar = id => db.pedidos.find(p => p.id == id);
const subtotal = p => p.items.reduce((s, i) => s + i.cant * i.precio, 0);

function precioDe(tipo) {
    const opcion = [...$('f_tipo').options].find(o => o.value == tipo);
    return opcion ? +opcion.dataset.precio : 0;
}

function prioridad(p) {
    const dias = (new Date(p.fecha) - new Date()) / 86400000;
    return dias < 7 ? 'Alta' : dias < 30 ? 'Media' : 'Baja';
}

// Datos listos para mostrar en el HTML
function datosPedido(p) {
    const s = subtotal(p);
    return {
        ...p,
        numero: numero(p.id),
        tipoPrecio: `${p.tipo} (S/ ${precioDe(p.tipo)} por persona)`,
        subtotal: soles(s),
        igv: soles(s * 0.18),
        total: soles(s * 1.18)
    };
}

// Rellena cada elemento con data-campo="x" usando datos.x
function llenar(contenedor, datos) {
    contenedor.querySelectorAll('[data-campo]').forEach(el => {
        const campo = el.dataset.campo;
        if (!(campo in datos)) return;
        el.textContent = datos[campo] === '' || datos[campo] == null ? '—' : datos[campo];
    });
}

// Muestra una sección y oculta las demás
function ir(seccion, texto = '') {
    document.querySelectorAll('main section').forEach(s => s.hidden = s.id != seccion);
    $('menu').hidden = !user;
    document.querySelectorAll('.solo-cliente').forEach(e => e.hidden = user?.rol != 'cliente');
    document.querySelectorAll('.solo-admin').forEach(e => e.hidden = user?.rol != 'admin');
    if (user) $('nombreUsuario').textContent = user.nombre;
    aviso(texto);
}

function aviso(texto) {
    $('mensaje').textContent = texto;
    $('mensaje').hidden = !texto;
}

// ---------- Acceso ----------
function entrar() {
    const email = valor('login_email').toLowerCase();
    const u = db.usuarios.find(x => x.email == email && x.clave == valor('login_clave'));
    if (!u) return aviso('Correo o contraseña incorrectos.');
    user = { rol: 'cliente', ...u };
    nuevoEvento();
}

function registrar() {
    const u = { nombre: valor('reg_nombre'), tel: valor('reg_tel'), email: valor('reg_email').toLowerCase(), clave: valor('reg_clave') };
    if (!u.nombre || !u.tel || !u.email || !u.clave) return aviso('Completa todos los campos.');
    if (db.usuarios.some(x => x.email == u.email)) return aviso('Ese correo ya está registrado.');
    db.usuarios.push(u);
    guardar();
    user = { rol: 'cliente', ...u };
    nuevoEvento();
}

function entrarAdmin() {
    if (valor('admin_usuario') != ADMIN.usuario || valor('admin_clave') != ADMIN.clave) {
        return aviso('Usuario o contraseña incorrectos.');
    }
    user = { rol: 'admin', nombre: 'Administración' };
    mostrarSolicitudes();
}

function salir() {
    user = null; borrador = {}; editando = false;
    document.querySelectorAll('#login input, #registro input, #admin input').forEach(i => i.value = '');
    ir('login');
}

// ---------- Cliente: registrar evento ----------
function nuevoEvento() {
    borrador = {};
    editando = false;
    mostrarEvento();
}

function mostrarEvento() {
    const d = borrador;
    $('f_nombre').value = d.nombre ?? user.nombre;
    $('f_tel').value = d.tel ?? user.tel ?? '';
    $('f_tipo').value = d.tipo || '';
    $('f_fecha').value = d.fecha || '';
    $('f_fecha').min = new Date().toISOString().slice(0, 10);
    $('f_com').value = d.com || '';
    $('f_ubic').value = d.ubic || '';
    $('f_specs').value = d.specs || '';
    ir('evento');
}

function revisarEvento() {
    borrador = {
        nombre: valor('f_nombre'), tel: valor('f_tel'), tipo: valor('f_tipo'), fecha: valor('f_fecha'),
        com: valor('f_com'), ubic: valor('f_ubic'), specs: valor('f_specs')
    };
    const d = borrador;
    if (!d.nombre || !d.tel || !d.tipo || !d.fecha || !(+d.com > 0) || !d.ubic) {
        return aviso('Completa todos los campos obligatorios.');
    }
    llenar($('revision'), datosPedido({ ...d, items: [] }));
    ir('revision');
}

function enviarEvento() {
    let texto;
    if (editando) {
        Object.assign(buscar(pedidoId), borrador, { estado: 'En Cotización' });
        texto = 'Solicitud modificada; el equipo actualizará la proforma.';
    } else {
        const id = db.pedidos.reduce((m, p) => Math.max(m, p.id), 0) + 1;
        db.pedidos.push({ id, email: user.email, ...borrador, estado: 'Solicitud Recibida', items: [] });
        texto = 'Solicitud enviada correctamente.';
    }
    guardar();
    borrador = {};
    editando = false;
    mostrarCotizaciones(texto);
}

// ---------- Cliente: cotizaciones ----------
function mostrarCotizaciones(texto = '') {
    const mias = db.pedidos.filter(p => p.email == user.email);
    $('sinCotizaciones').hidden = mias.length > 0;
    $('listaCotizaciones').innerHTML = '';

    mias.forEach(p => {
        const tarjeta = $('tplCotizacion').content.cloneNode(true);
        llenar(tarjeta, {
            ...datosPedido(p),
            resumen: `${p.tipo} · ${p.fecha} · ${p.com} comensales`,
            totalTexto: p.items.length ? 'Total: ' + datosPedido(p).total : 'Proforma en preparación'
        });
        tarjeta.querySelector('[data-accion=ver]').onclick = () => mostrarCotizacion(p.id);
        const botonModificar = tarjeta.querySelector('[data-accion=modificar]');
        if (p.estado == 'Pedido Confirmado') botonModificar.remove();
        else botonModificar.onclick = () => modificar(p.id);
        $('listaCotizaciones').append(tarjeta);
    });

    ir('misCotizaciones', texto);
}

function modificar(id) {
    const { nombre, tel, tipo, fecha, com, ubic, specs } = buscar(id);
    borrador = { nombre, tel, tipo, fecha, com, ubic, specs };
    pedidoId = id;
    editando = true;
    mostrarEvento();
}

function mostrarCotizacion(id) {
    pedidoId = id;
    const p = buscar(id);
    llenar($('verCotizacion'), datosPedido(p));

    $('detalleItems').innerHTML = '';
    p.items.forEach(i => {
        const linea = $('tplLinea').content.cloneNode(true);
        llenar(linea, { texto: `${i.cant} × ${i.desc} — ${soles(i.cant * i.precio)}` });
        $('detalleItems').append(linea);
    });

    $('sinProforma').hidden = p.items.length > 0;
    $('totalesCliente').hidden = p.items.length == 0;
    $('btnAceptar').hidden = p.estado != 'Proforma Disponible';
    ir('verCotizacion');
}

function aceptar() {
    buscar(pedidoId).estado = 'Pedido Confirmado';
    guardar();
    mostrarCotizaciones('¡Cotización confirmada! Tu pedido quedó registrado.');
}

// ---------- Administración: solicitudes ----------
function mostrarSolicitudes(texto = '') {
    $('sinSolicitudes').hidden = db.pedidos.length > 0;
    $('filasSolicitudes').innerHTML = '';

    db.pedidos.forEach(p => {
        const fila = $('tplSolicitud').content.cloneNode(true);
        llenar(fila, {
            ...datosPedido(p),
            descripcion: `${p.tipo} · ${p.com} comensales`,
            prioridad: prioridad(p)
        });
        const boton = fila.querySelector('[data-accion=cotizar]');
        if (p.estado == 'Pedido Confirmado') boton.remove();
        else boton.onclick = () => cotizar(p.id);
        $('filasSolicitudes').append(fila);
    });

    ir('solicitudes', texto);
}

// ---------- Administración: elaborar proforma ----------
function cotizar(id) {
    const p = buscar(id);
    pedidoId = id;
    if (p.estado == 'Solicitud Recibida') p.estado = 'En Cotización';
    if (!p.items.length) {
        p.items = [{ desc: 'Servicio ' + p.tipo + ' (por comensal)', cant: +p.com, precio: precioDe(p.tipo) }];
    }
    guardar();
    dibujarItems();
    ir('proforma');
}

function dibujarItems() {
    const p = buscar(pedidoId);
    $('filasItems').innerHTML = '';

    p.items.forEach(item => {
        const fila = $('tplItem').content.cloneNode(true);
        fila.querySelectorAll('[data-item]').forEach(input => {
            const campo = input.dataset.item;
            input.value = item[campo];
            input.oninput = () => {
                item[campo] = campo == 'desc' ? input.value : +input.value;
                actualizarTotales();
            };
        });
        $('filasItems').append(fila);
    });

    actualizarTotales();
}

function actualizarTotales() {
    const p = buscar(pedidoId);
    llenar($('proforma'), datosPedido(p));
    [...$('filasItems').children].forEach((fila, k) => {
        fila.querySelector('[data-campo=subLinea]').textContent = soles(p.items[k].cant * p.items[k].precio);
    });
}

function agregarItem() {
    buscar(pedidoId).items.push({ desc: '', cant: 1, precio: 0 });
    dibujarItems();
}

function enviarProforma() {
    const p = buscar(pedidoId);
    p.items = p.items.filter(i => i.desc.trim() && i.cant > 0);
    if (!p.items.length) {
        dibujarItems();
        return aviso('Agrega al menos un ítem válido.');
    }
    p.estado = 'Proforma Disponible';
    guardar();
    mostrarSolicitudes('Proforma ' + numero(p.id) + ' enviada al cliente.');
}

// ---------- Inicio ----------
ir('login');