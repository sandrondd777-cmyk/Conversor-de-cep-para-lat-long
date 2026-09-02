// tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  });
});

function showError(el, msg) {
  el.textContent = msg;
  el.classList.add('show');
}
function hideError(el) {
  el.classList.remove('show');
}

// CEP -> coordinates
const cepInput = document.getElementById('cepInput');
const cepBtn = document.getElementById('cepBtn');
const cepError = document.getElementById('cepError');
const cepResult = document.getElementById('cepResult');
const cepAddr = document.getElementById('cepAddr');
const cepCoords = document.getElementById('cepCoords');

cepInput.addEventListener('input', () => {
  let v = cepInput.value.replace(/\D/g, '').slice(0, 8);
  if (v.length > 5) v = v.slice(0,5) + '-' + v.slice(5);
  cepInput.value = v;
});

const cepNearby = document.getElementById('cepNearby');
const cepInfo = document.getElementById('cepInfo');

const cepAlteradoMap = {
  '36415970': { novo: '36410970' },
};

function formatarCep(cep) {
  const digits = (cep || '').replace(/\D/g, '');
  if (digits.length !== 8) return cep || '';
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function buscarCepAlterado(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  const alterado = cepAlteradoMap[digits];
  if (!alterado) return null;

  return {
    antigo: formatarCep(digits),
    novo: formatarCep(alterado.novo),
    novoDigits: alterado.novo,
  };
}

function showInfo(el, msg) {
  el.innerHTML = msg;
  el.classList.add('show');
}
function hideInfo(el) {
  el.classList.remove('show');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

let map;
let mapLayerGroup;
const mapPanel = document.getElementById('cepMapPanel');
const mapToggle = document.getElementById('toggleMap');

function initMap() {
  if (map) return;
  map = L.map('cepMap', { zoomControl: true }).setView([-14.235, -51.9253], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);
  mapLayerGroup = L.layerGroup().addTo(map);
}

const mapBackdrop = document.getElementById('mapBackdrop');

function showMap() {
  mapBackdrop.classList.add('open');
  mapPanel.classList.add('open');
  initMap();
  setTimeout(() => map.invalidateSize(), 250);
}

function hideMap() {
  mapBackdrop.classList.remove('open');
  mapPanel.classList.remove('open');
  if (map) {
    mapLayerGroup.clearLayers();
  }
}

mapBackdrop.addEventListener('click', hideMap);

function atualizarMapa(principal, alternativas = []) {
  initMap();
  mapLayerGroup.clearLayers();

  const marcadores = [];
  if (principal) {
    const marker = L.marker([principal.lat, principal.lng]).addTo(mapLayerGroup);
    marker.bindPopup(`<strong>CEP atual</strong><br>${principal.cep}<br>${principal.endereco}`).openPopup();
    marcadores.push([principal.lat, principal.lng]);
  }

  alternativas.forEach(item => {
    const marker = L.marker([item.lat, item.lng]).addTo(mapLayerGroup);
    marker.bindPopup(`<strong>Alternativa</strong><br>${item.cep}<br>${item.endereco}`);
    marcadores.push([item.lat, item.lng]);
  });

  if (marcadores.length) {
    const bounds = L.latLngBounds(marcadores);
    map.fitBounds(bounds.pad(0.25));
  }
}

// tenta geocodificar um endereço; retorna {lat, lng} ou null
async function tentarGeocodificar(enderecoStr) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(enderecoStr)}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.length) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (e) { /* ignora e segue tentando os próximos */ }
  return null;
}

async function tentarGeocodificarPorCep(cep, localidade, uf) {
  const partes = [cep];
  if (localidade) partes.push(localidade);
  if (uf) partes.push(uf);
  partes.push('Brasil');
  const enderecoCep = partes.filter(Boolean).join(' ');

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(enderecoCep)}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.length) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (e) { /* ignora */ }
  return null;
}

async function tentarGeocodificarComFallback(item) {
  const partes = [];
  if (item.logradouro) partes.push(item.logradouro);
  if (item.bairro) partes.push(item.bairro);
  if (item.localidade) partes.push(item.localidade);
  if (item.uf) partes.push(item.uf);
  const enderecoCompleto = partes.length ? `${partes.join(', ')}, Brasil` : '';

  if (enderecoCompleto) {
    let coords = await tentarGeocodificar(enderecoCompleto);
    if (coords) return { coords, endereco: enderecoCompleto };
  }

  if (item.cep) {
    const coordsCep = await tentarGeocodificarPorCep(item.cep, item.localidade, item.uf);
    if (coordsCep) return { coords: coordsCep, endereco: `CEP ${item.cep}, ${item.localidade || ''} ${item.uf || ''}, Brasil`.trim() };
  }

  const partesSimples = [];
  if (item.bairro) partesSimples.push(item.bairro);
  if (item.localidade) partesSimples.push(item.localidade);
  if (item.uf) partesSimples.push(item.uf);
  const enderecoSimples = partesSimples.length ? `${partesSimples.join(', ')}, Brasil` : '';
  if (enderecoSimples && enderecoSimples !== enderecoCompleto) {
    const coords = await tentarGeocodificar(enderecoSimples);
    if (coords) return { coords, endereco: enderecoSimples };
  }

  return null;
}

// monta lista de CEPs candidatos "próximos": primeiro tenta mesma rua (ViaCEP),
// depois completa com CEPs numericamente vizinhos
async function montarCandidatos(viaCepData, cepOriginal) {
  const candidatos = [];
  const vistos = new Set([cepOriginal]);

  if (viaCepData.logradouro && viaCepData.logradouro.trim().length >= 3) {
    try {
      const url = `https://viacep.com.br/ws/${viaCepData.uf}/${encodeURIComponent(viaCepData.localidade)}/${encodeURIComponent(viaCepData.logradouro)}/json/`;
      const resp = await fetch(url);
      const lista = await resp.json();
      if (Array.isArray(lista)) {
        for (const item of lista) {
          const cepLimpo = (item.cep || '').replace(/\D/g, '');
          if (cepLimpo && !vistos.has(cepLimpo)) {
            vistos.add(cepLimpo);
            candidatos.push(item);
          }
        }
      }
    } catch (e) { /* segue para o fallback numérico */ }
  }

  // completa com CEPs vizinhos por número, caso a busca por rua não renda o suficiente
  if (candidatos.length < 8) {
    const base = parseInt(cepOriginal, 10);
    const offsets = [1,-1,2,-2,3,-3,4,-4,5,-5,8,-8,12,-12,15,-15,20,-20,25,-25,30,-30];
    for (const off of offsets) {
      if (candidatos.length >= 20) break;
      const candidatoCep = String(base + off).padStart(8, '0');
      if (vistos.has(candidatoCep)) continue;
      vistos.add(candidatoCep);
      try {
        const resp = await fetch(`https://viacep.com.br/ws/${candidatoCep}/json/`);
        const data = await resp.json();
        if (!data.erro) candidatos.push(data);
      } catch (e) { /* ignora este candidato */ }
    }
  }

  return candidatos;
}

async function buscarCepsProximos(viaCepData, cepOriginal) {
  cepNearby.innerHTML = '';
  cepNearby.style.display = 'none';

  const candidatos = await montarCandidatos(viaCepData, cepOriginal);
  const encontrados = [];

  for (const c of candidatos) {
    if (encontrados.length >= 4) break;
    const resultado = await tentarGeocodificarComFallback(c);
    if (resultado) {
      encontrados.push({ cep: c.cep, endereco: resultado.endereco, ...resultado.coords });
    }
    await sleep(1100); // respeita o limite de uso do Nominatim (~1 req/s)
  }

  if (encontrados.length) {
    cepNearby.style.display = 'grid';
    cepNearby.innerHTML = encontrados.map(item => `
      <div class="nearby-card">
        <div class="n-cep">${item.cep}</div>
        <div class="n-addr">${item.endereco}</div>
        <div class="n-coords">lat ${item.lat.toFixed(6)}, lng ${item.lng.toFixed(6)}</div>
      </div>
    `).join('');

    const lista = encontrados.map((item, index) =>
      `${index + 1}. CEP: ${item.cep}\n   Lat: ${item.lat.toFixed(6)}\n   Lng: ${item.lng.toFixed(6)}\n   Endereço: ${item.endereco}`
    ).join('\n\n');

    document.getElementById('cepListText').textContent = lista;
    document.getElementById('cepListPanel').style.display = 'block';
  } else {
    document.getElementById('cepListPanel').style.display = 'none';
  }

  return encontrados;
}

function atualizarMapas(principal, alternativas = []) {
  if (!principal && alternativas.length === 0) {
    hideMap();
    return;
  }
  atualizarMapa(principal, alternativas);
}

async function buscarPorCep() {
  const raw = cepInput.value.replace(/\D/g, '');
  hideError(cepError);
  hideInfo(cepInfo);
  cepResult.classList.remove('show');
  cepNearby.style.display = 'none';
  cepNearby.innerHTML = '';

  if (raw.length !== 8) {
    showError(cepError, 'Digite um CEP válido com 8 dígitos.');
    return;
  }

  const cepAlterado = buscarCepAlterado(raw);
  const cepConsulta = cepAlterado ? cepAlterado.novoDigits : raw;

  cepBtn.disabled = true;
  cepBtn.textContent = 'Buscando...';

  try {
    if (cepAlterado) {
      showInfo(cepInfo, `Atenção! O CEP ${cepAlterado.antigo} foi alterado para ${cepAlterado.novo}. Buscando o CEP vigente.`);
    }

    const viaCepResp = await fetch(`https://viacep.com.br/ws/${cepConsulta}/json/`);
    const viaCepData = await viaCepResp.json();

    if (viaCepData.erro) {
      showError(cepError, 'CEP não encontrado.');
      return;
    }

    const enderecoStr = `${viaCepData.logradouro || ''}, ${viaCepData.bairro || ''}, ${viaCepData.localidade} - ${viaCepData.uf}, Brasil`;
    let coords = await tentarGeocodificar(enderecoStr);

    if (!coords) {
      coords = await tentarGeocodificarPorCep(cepConsulta, viaCepData.localidade, viaCepData.uf);
    }

    if (coords) {
      cepAddr.textContent = enderecoStr;
      cepCoords.textContent = `lat ${coords.lat.toFixed(6)}, lng ${coords.lng.toFixed(6)}`;
      cepResult.classList.add('show');

      cepBtn.textContent = 'Buscando alternativas...';
      const encontrados = await buscarCepsProximos(viaCepData, cepConsulta);
      if (encontrados.length) {
        showInfo(cepInfo, `Atenção! O CEP ${cepAlterado ? cepAlterado.antigo : ''}${cepAlterado ? ' foi alterado para ' : ''}${cepAlterado ? cepAlterado.novo : ''}${cepAlterado ? '. ' : ''}Endereço encontrado. A seguir, ${encontrados.length} CEP(s) alternativo(s) mais próximos:`);
        mapToggle.style.display = 'inline-flex';
        atualizarMapas({ cep: cepConsulta, endereco: enderecoStr, ...coords }, encontrados);
      } else {
        showInfo(cepInfo, `Atenção! O CEP ${cepAlterado ? cepAlterado.antigo : ''}${cepAlterado ? ' foi alterado para ' : ''}${cepAlterado ? cepAlterado.novo : ''}${cepAlterado ? '. ' : ''}Endereço encontrado mas não foi possível localizar CEPs alternativos com coordenadas.`);
        mapToggle.style.display = 'inline-flex';
        atualizarMapas({ cep: cepConsulta, endereco: enderecoStr, ...coords }, []);
      }
      return;
    }

    // endereço exato não geocodificável — busca alternativas próximas
    showInfo(cepInfo, `${cepAlterado ? `Atenção! O CEP ${cepAlterado.antigo} foi alterado para ${cepAlterado.novo}. ` : ''}Esse endereço não está indexado no mapa (comum em ruas novas ou pouco mapeadas). Endereço via ViaCEP: <strong>${enderecoStr}</strong><br>Buscando os CEPs e coordenadas mais próximos, aguarde...`);
    cepBtn.textContent = 'Buscando próximos...';

    const encontrados = await buscarCepsProximos(viaCepData, cepConsulta);

    if (!encontrados.length) {
      showInfo(cepInfo, `${cepAlterado ? `Atenção! O CEP ${cepAlterado.antigo} foi alterado para ${cepAlterado.novo}. ` : ''}Esse endereço não está indexado no mapa. Endereço via ViaCEP: <strong>${enderecoStr}</strong><br>Também não foi possível localizar CEPs vizinhos com coordenadas.`);
      mapToggle.style.display = 'none';
      atualizarMapas(null, []);
    } else {
      showInfo(cepInfo, `${cepAlterado ? `Atenção! O CEP ${cepAlterado.antigo} foi alterado para ${cepAlterado.novo}. ` : ''}Esse endereço não está indexado no mapa. Endereço via ViaCEP: <strong>${enderecoStr}</strong><br>Abaixo, os CEPs e coordenadas mais próximos encontrados (mesma rua ou região):`);
      mapToggle.style.display = 'inline-flex';
      atualizarMapas(null, encontrados);
    }
  } catch (err) {
    showError(cepError, 'Erro ao buscar dados. Tente novamente.');
  } finally {
    cepBtn.disabled = false;
    cepBtn.textContent = 'Buscar';
  }
}

cepBtn.addEventListener('click', buscarPorCep);
cepInput.addEventListener('keydown', e => { if (e.key === 'Enter') buscarPorCep(); });

async function copiarTexto(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      // Tenta o método compatível quando a permissão da API moderna falhar.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copiado = document.execCommand('copy');
  textarea.remove();
  if (!copiado) throw new Error('Copy command failed');
}

document.getElementById('copyCoordinates').addEventListener('click', () => {
  const text = cepCoords.textContent;
  if (!text || text.includes('—')) return;
  const btn = document.getElementById('copyCoordinates');
  const iconCopy = btn.querySelector('.icon-copy');
  const iconCheck = btn.querySelector('.icon-check');
  copiarTexto(text).then(() => {
    iconCopy.style.display = 'none';
    iconCheck.style.display = 'block';
    btn.classList.add('copied');
    setTimeout(() => {
      iconCopy.style.display = 'block';
      iconCheck.style.display = 'none';
      btn.classList.remove('copied');
    }, 1500);
  }).catch(() => {
    showError(cepError, 'Não foi possível copiar as coordenadas automaticamente.');
  });
});

mapToggle.addEventListener('click', () => {
  if (mapPanel.classList.contains('open')) {
    hideMap();
  } else {
    showMap();
  }
});

document.getElementById('closeMap').addEventListener('click', () => {
  hideMap();
});

document.getElementById('copyAlternatives').addEventListener('click', () => {
  const text = document.getElementById('cepListText').textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showInfo(cepInfo, 'Lista copiada para a área de transferência.');
  }).catch(() => {
    showError(cepError, 'Não foi possível copiar a lista automaticamente. Selecione e copie manualmente.');
  });
});

// coordinates -> CEP
const latInput = document.getElementById('latInput');
const lngInput = document.getElementById('lngInput');
const geoBtn = document.getElementById('geoBtn');
const geoError = document.getElementById('geoError');
const geoResult = document.getElementById('geoResult');
const geoCep = document.getElementById('geoCep');
const geoAddr = document.getElementById('geoAddr');

async function buscarPorCoords() {
  hideError(geoError);
  geoResult.classList.remove('show');

  const lat = parseFloat(latInput.value);
  const lng = parseFloat(lngInput.value);

  if (isNaN(lat) || isNaN(lng)) {
    showError(geoError, 'Digite latitude e longitude válidas.');
    return;
  }

  geoBtn.disabled = true;
  geoBtn.textContent = 'Buscando...';

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
    const resp = await fetch(url);
    const data = await resp.json();

    const cep = data?.address?.postcode;
    if (!cep) {
      showError(geoError, 'Não foi possível encontrar um CEP para essas coordenadas.');
      return;
    }

    const a = data.address;
    const enderecoStr = [a.road, a.suburb || a.neighbourhood, a.city || a.town || a.village, a.state]
      .filter(Boolean).join(', ');

    geoCep.textContent = cep;
    geoAddr.textContent = enderecoStr || data.display_name;
    geoResult.classList.add('show');
  } catch (err) {
    showError(geoError, 'Erro ao buscar dados. Tente novamente.');
  } finally {
    geoBtn.disabled = false;
    geoBtn.textContent = 'Buscar CEP';
  }
}

geoBtn.addEventListener('click', buscarPorCoords);
[latInput, lngInput].forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter') buscarPorCoords(); }));

// Routes: helper to clean CEP
function cleanCep(v){ return (v||'').replace(/\D/g,'').padStart(8,'0'); }

// simple haversine distance (km)
function haversine(a,b){
  const toRad = x => x*Math.PI/180;
  const R = 6371;
  const dLat = toRad(b.lat-a.lat); const dLon = toRad(b.lng-a.lng);
  const la = toRad(a.lat); const lb = toRad(b.lat);
  const x = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(la)*Math.cos(lb)*Math.sin(dLon/2)*Math.sin(dLon/2);
  const c = 2*Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
  return R*c;
}

async function geocodeCepToCoords(cep, number){
  const raw = cleanCep(cep);
  if (!raw || raw.length !== 8) return null;
  try {
    const via = await (await fetch(`https://viacep.com.br/ws/${raw}/json/`)).json();
    if (via.erro) return null;
    // try Nominatim with logradouro + city
    const q = `${via.logradouro || ''} ${via.localidade || ''} ${via.uf || ''} Brasil ${number || ''}`.trim();
    const geo = await tentarGeocodificar(q);
    if (geo) return { lat: geo.lat, lng: geo.lng, address: `${via.logradouro || ''}, ${via.localidade || ''} - ${via.uf || ''}` };
    const byCep = await tentarGeocodificarPorCep(raw, via.localidade, via.uf);
    if (byCep) return { lat: byCep.lat, lng: byCep.lng, address: `${via.localidade} - ${via.uf}` };
  } catch(e){ }
  return null;
}

async function fetchORSRoute(originCoords, destCoords, apiKey) {
  const url = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';
  const body = { coordinates: [[originCoords.lng, originCoords.lat], [destCoords.lng, destCoords.lat]] };
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = apiKey;
  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!resp.ok) throw new Error('ORS request failed');
  const data = await resp.json();
  const feat = data.features && data.features[0];
  if (!feat) throw new Error('ORS returned no features');
  const summary = feat.properties && feat.properties.summary;
  const coords = feat.geometry && feat.geometry.coordinates; // [lng,lat]...
  return {
    router: 'ors',
    distance_km: +( (summary.distance/1000).toFixed(2) ),
    duration_min: Math.round(summary.duration/60),
    geometry: coords,
    tollCount: 0,
    tolls: [],
    legs: [{ from: originCoords, to: destCoords }]
  };
}

function sampleCoordinates(coords, maxSamples=20) {
  if (!coords || !coords.length) return [];
  const step = Math.max(1, Math.floor(coords.length / maxSamples));
  const samples = [];
  for (let i = 0; i < coords.length; i += step) samples.push(coords[i]);
  return samples;
}

async function detectTollsOverpass(geometryCoords, radiusMeters=1000) {
  // geometryCoords: array of [lng,lat]
  // increase sampling to better cover long routes
  const samples = sampleCoordinates(geometryCoords, 100);
  if (!samples.length) return [];
  const parts = samples.map(pt => {
    const lng = pt[0], lat = pt[1];
    return [
      `node(around:${radiusMeters},${lat},${lng})[barrier=toll_booth];`,
      `node(around:${radiusMeters},${lat},${lng})[toll];`,
      `node(around:${radiusMeters},${lat},${lng})[highway=toll_booth];`,
      `way(around:${radiusMeters},${lat},${lng})[toll];`,
      `way(around:${radiusMeters},${lat},${lng})[toll=yes];`,
      `way(around:${radiusMeters},${lat},${lng})[highway=toll_gantry];`,
      `way(around:${radiusMeters},${lat},${lng})[highway=toll_booth];`,
      `relation(around:${radiusMeters},${lat},${lng})[toll];`
    ].join('');
  }).join('');

  const q = `[out:json][timeout:120];(${parts});out center;`;
  try {
    const resp = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: q
    });
    if (!resp.ok) {
      console.warn('Overpass returned non-ok status', resp.status);
    } else {
      const data = await resp.json();
      const elements = data.elements || [];
      if (elements.length) {
        const unique = new Map();
        for (const el of elements) {
          const key = `${el.type}/${el.id}`;
          unique.set(key, el);
        }
        return Array.from(unique.values()).map(n => {
          const lat = n.lat || (n.center && n.center.lat) || (n.bounds && (n.bounds.minlat+n.bounds.maxlat)/2);
          const lon = n.lon || (n.center && n.center.lon) || (n.bounds && (n.bounds.minlon+n.bounds.maxlon)/2);
          return { id: n.id, type: n.type, lat, lon, tags: n.tags || {} };
        });
      }
    }
  } catch (e) {
    console.warn('Overpass error (sampled)', e);
  }

  // Fallback: try a bbox-based query over the entire route extents (useful when sampling misses ways)
  try {
    let minLat = 90, minLon = 180, maxLat = -90, maxLon = -180;
    for (const c of geometryCoords) {
      const lng = c[0], lat = c[1];
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLon) minLon = lng;
      if (lng > maxLon) maxLon = lng;
    }
    // expand bbox by radiusMeters (approx degrees)
    const deg = (radiusMeters || 1000) / 111000; // ~111 km per degree
    minLat -= deg; maxLat += deg; minLon -= deg; maxLon += deg;
    const south = minLat.toFixed(6), west = minLon.toFixed(6), north = maxLat.toFixed(6), east = maxLon.toFixed(6);
    const bboxParts = [
      `node[barrier=toll_booth](${south},${west},${north},${east});`,
      `node[toll](${south},${west},${north},${east});`,
      `way[toll](${south},${west},${north},${east});`,
      `way[toll=yes](${south},${west},${north},${east});`,
      `way[highway=toll_gantry](${south},${west},${north},${east});`,
      `way[highway=toll_booth](${south},${west},${north},${east});`,
      `relation[toll](${south},${west},${north},${east});`
    ].join('');
    const q2 = `[out:json][timeout:120];(${bboxParts});out center;`;
    const resp2 = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: q2 });
    if (resp2.ok) {
      const data2 = await resp2.json();
      const elems = data2.elements || [];
      const unique = new Map();
      for (const el of elems) {
        const key = `${el.type}/${el.id}`;
        unique.set(key, el);
      }
      if (unique.size) {
        return Array.from(unique.values()).map(n => {
          const lat = n.lat || (n.center && n.center.lat) || (n.bounds && (n.bounds.minlat+n.bounds.maxlat)/2);
          const lon = n.lon || (n.center && n.center.lon) || (n.bounds && (n.bounds.minlon+n.bounds.maxlon)/2);
          return { id: n.id, type: n.type, lat, lon, tags: n.tags || {} };
        });
      }
    } else {
      console.warn('Overpass bbox query returned non-ok', resp2.status);
    }
  } catch (e) {
    console.warn('Overpass bbox fallback error', e);
  }

  return [];
}

async function calcRoute(router, originCoords, destCoords, opts={}){
  // ORS if selected and key provided; otherwise fallback to simple stub
  if (router === 'ors'){
    const apiKey = document.getElementById('orsKey').value.trim();
    try {
      const res = await fetchORSRoute(originCoords, destCoords, apiKey || null);
      // detect tolls along route geometry
      const tolls = await detectTollsOverpass(res.geometry || []);
      res.tollCount = tolls.length;
      res.tolls = tolls.map((t,i)=>({ name: t.tags.name || `Toll ${i+1}`, cost: '—', id: t.id, lat: t.lat, lon: t.lon }));
      return res;
    } catch (e) {
      // fallback to stub when ORS fails
    }
  }

  // fallback stub
  const km = haversine(originCoords, destCoords);
  const baseSpeed = router === 'maplink' ? 70 : 65; // km/h
  const durationHours = km / baseSpeed;
  const tollCount = router === 'maplink' ? Math.max(0, Math.floor(km/120)) : Math.max(0, Math.floor((km+30)/150));
  const tolls = [];
  for(let i=0;i<tollCount;i++) tolls.push({ name:`Praça #${i+1}`, cost: (20 + i*3).toFixed(2) });
  return { router, distance_km: +(km.toFixed(2)), duration_min: Math.round(durationHours*60), tollCount, tolls, legs: [{ from: originCoords, to: destCoords }] };
}

function renderRoute(result, container){
  const el = document.createElement('div');
  el.className = 'route-item';
  el.innerHTML = `<div style="font-weight:700">${result.router.toUpperCase()}</div>
    <div>Distância: ${result.distance_km} km</div>
    <div>Duração aprox.: ${result.duration_min} min</div>
    <div>Praças de pedágio: ${result.tollCount}</div>`;
  if (result.tolls && result.tolls.length) {
    const list = document.createElement('div');
    list.style.marginTop='8px';
    list.innerHTML = '<small>Pedágios:</small>' + result.tolls.map(t=>`<div>${t.name} — R$ ${t.cost}</div>`).join('');
    el.appendChild(list);
  }
  container.appendChild(el);
}

// draw route geometry (array of [lng,lat]) and toll markers on the map
function drawRouteOnMap(geometryCoords, tolls) {
  if (!geometryCoords || !geometryCoords.length) return;
  initMap();
  mapLayerGroup.clearLayers();
  const latlngs = geometryCoords.map(c => [c[1], c[0]]);
  const poly = L.polyline(latlngs, { color: '#D1495B', weight: 4, opacity: 0.9 }).addTo(mapLayerGroup);
  // add start/end markers
  const start = latlngs[0]; const end = latlngs[latlngs.length-1];
  L.circleMarker(start, { radius:6, color:'#0b6' }).addTo(mapLayerGroup).bindPopup('Origem').openPopup();
  L.circleMarker(end, { radius:6, color:'#06b' }).addTo(mapLayerGroup).bindPopup('Destino');
  // add toll markers if any
  if (tolls && tolls.length) {
    tolls.forEach(t => {
      if (!t.lat || !t.lon) return;
      const m = L.marker([t.lat, t.lon], { icon: L.divIcon({ className: 'toll-marker', html: '⛽', iconSize: [18,18] }) }).addTo(mapLayerGroup);
      const name = t.name || (t.tags && t.tags.name) || `Toll ${t.id}`;
      m.bindPopup(`<strong>${name}</strong><br/>ID: ${t.id}`);
    });
  }
  // fit map
  const bounds = poly.getBounds();
  map.fitBounds(bounds.pad(0.2));
  showMap();
}

async function handleCalc(router) {
  const oCep = document.getElementById('originCep').value;
  const dCep = document.getElementById('destCep').value;
  const oNum = document.getElementById('originNum').value;
  const dNum = document.getElementById('destNum').value;
  const err = document.getElementById('routesError');
  const resWrap = document.getElementById('routesResult');
  const summary = document.getElementById('routesSummary');
  const details = document.getElementById('routesDetails');
  const list = document.getElementById('routeList');
  err.classList.remove('show');
  list.innerHTML = '';
  details.textContent = 'Calculando...';
  resWrap.classList.add('show');

  const o = await geocodeCepToCoords(oCep, oNum);
  const d = await geocodeCepToCoords(dCep, dNum);
  if (!o || !d) {
    showError(err, 'Não foi possível geocodificar origem ou destino. Verifique os CEPs.');
    details.textContent = 'Erro';
    return;
  }

  const result = await calcRoute(router, {lat:o.lat, lng:o.lng}, {lat:d.lat, lng:d.lng});
  summary.textContent = `${result.distance_km} km • ${result.duration_min} min • ${result.tollCount} pedágios (${result.router})`;
  details.textContent = `Origem: ${o.address || ''} — Destino: ${d.address || ''}`;
  renderRoute(result, list);
  // draw route and tolls on map if geometry available (ORS) or fallback to simple line
  if (result.geometry && result.geometry.length) {
    drawRouteOnMap(result.geometry, result.tolls || []);
  } else {
    // fallback: simple line between origin and dest
    const simpleGeom = [ [o.lng, o.lat], [d.lng, d.lat] ];
    drawRouteOnMap(simpleGeom, result.tolls || []);
  }
  // ensure map toggle button is visible so user can re-open the map after closing
  try { if (mapToggle) mapToggle.style.display = 'inline-flex'; } catch(e){}
  return result;
}

async function handleCompare(){
  const container = document.getElementById('compareResults');
  container.innerHTML = 'Comparando...';
  const maplink = await handleCalc('maplink');
  const qualp = await handleCalc('qualp');
  container.innerHTML = '';
  const diff = [];
  if (maplink && qualp) {
    container.innerHTML = `<div><strong>Maplink</strong>: ${maplink.distance_km} km — ${maplink.tollCount} pedágios</div>
      <div><strong>Qualp</strong>: ${qualp.distance_km} km — ${qualp.tollCount} pedágios</div>`;
    if (maplink.tollCount !== qualp.tollCount) {
      container.innerHTML += `<div style="margin-top:8px;color:#8A2E1F">Diferença no número de praças: Maplink ${maplink.tollCount} vs Qualp ${qualp.tollCount}</div>`;
    } else {
      container.innerHTML += `<div style="margin-top:8px;color:#23524A">Mesmo número de praças de pedágio.</div>`;
    }
  } else container.innerHTML = 'Falha ao calcular rotas para comparação.';
}

document.getElementById('calcRoute').addEventListener('click', async () => {
  const r = document.getElementById('routerSelect').value;
  await handleCalc(r);
});
document.getElementById('compareRoutes').addEventListener('click', handleCompare);