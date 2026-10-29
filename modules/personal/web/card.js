/* Trading: ship-aware searches and explicit outbound/return legs. */
(() => {
  const {esc, fmt, ls} = Lab.util;
  const KEY = 'personal.search.v2';
  const price = n => `${fmt(n)} Cr`;
  const external = (href, label) => `<a class="mini" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  const routeLink = (r, settings) => {
    const first = r.legs[0];
    const p = new URLSearchParams({ps1: `${first.buy.station} [${first.buy.system}]`, ps2: `${first.sell.station} [${first.sell.system}]`,
      pi7: settings.carriers ? '0' : '1', pi10: String(r.quantity), pi4: String({S: 1, M: 2, L: 3}[settings.pad]), pi5: settings.surface ? '0' : '1'});
    // Inara only offers discrete age/approach choices. Exact pair is prefilled;
    // do not imply the external website shares unsupported search filters.
    return `https://inara.cz/elite/market-traderoutes-search/?${p}`;
  };
  const stop = (m, label) => `<div class="trade-pair-stop"><div class="row"><span class="tag">${label}</span><strong>${price(m.price)}/t</strong></div>
    <div class="trading-station">${esc(m.station)}</div><div class="muted">${esc(m.system)}</div>
    <div class="row trading-actions"><button type="button" class="mini" data-copy="${esc(m.system)}">Copy system</button><button type="button" class="mini" data-copy="${esc(m.station)}">Copy station</button>${external(Lab.util.inaraMarket(m.station, m.system), 'Inara market')}</div>
    <div class="note">${fmt(m.volume)} t ${label === 'Buy' ? 'supply' : 'demand'} | ${esc(m.pad)} pad | ${m.arrival_ls == null ? 'Approach unknown' : fmt(m.arrival_ls) + ' Ls'}<br>Reported ${esc(new Date(m.observed_at).toLocaleString())}${m.carrier ? `<br><strong>Fleet carrier</strong> | Docking access: ${esc(m.docking_access || "unknown; verify before travel")}` : ""}</div></div>`;
  const route = (r, result, index) => `<article class="trade-pair trading-route">
    <div class="trading-summary"><div><span class="tag">${r.route_type === 'round_trip' ? 'Round trip' : 'One way'}</span><h3>${esc(r.legs[0].buy.station)} to ${esc(r.legs[0].sell.station)}${r.legs.length === 2 ? ' and back' : ''}</h3></div><div class="trading-total"><strong class="ok">${price(r.profit)}</strong><span class="note">estimated profit / ${r.legs.length === 2 ? 'round trip' : 'load'}</span></div></div>
    <div class="trading-metrics"><span>${fmt(r.quantity)} t per leg</span><span>${fmt(r.distance)} Ly each way</span><span>${r.estimated_jumps == null ? 'Laden jump estimate unavailable' : fmt(r.estimated_jumps) + ' estimated jumps per leg'}</span><span>Oldest report: ${r.age_hours == null ? "unknown" : Number(r.age_hours).toFixed(1) + " h"}</span><span>${Number(r.return_on_cost).toFixed(1)}% return on purchase costs</span></div>
    ${r.legs.map((leg, i) => `<section class="trading-leg"><p class="trading-instruction"><strong>${i + 1}. BUY ${fmt(leg.quantity)} t of ${esc(leg.commodity)}</strong> at ${esc(leg.buy.station)} (${esc(leg.buy.system)}).<br><strong>Then SELL ${esc(leg.commodity)}</strong> at ${esc(leg.sell.station)} (${esc(leg.sell.system)}).</p><div class="row trade-pair-heading"><b>${i === 0 ? 'Outbound' : 'Return'}: ${esc(leg.commodity)}</b><span class="ok">+${price(leg.profit)} <span class="muted">(${price(leg.per_ton)}/t)</span></span></div><div class="trade-pair-stops">${stop(leg.buy, 'Buy')}${stop(leg.sell, 'Sell')}</div></section>`).join('')}
    <div class="row trade-pair-footer"><span class="note">${price(r.required_credits)} starting credits needed | ${price(r.cost)} total purchases</span>${external(routeLink(r, result.settings), 'View route on Inara')}<button type="button" class="mini" data-favorite="${index}">Save favorite</button><button type="button" class="mini" data-monitor="${index}">Monitor this route</button></div>
    ${result.credits != null && r.required_credits > result.credits ? '<p class="warn">Starting credits needed exceed your reported balance. Reduce the load.</p>' : ''}
    ${result.ship_capacity != null && r.quantity > result.ship_capacity ? '<p class="warn">Load exceeds your reported ship capacity.</p>' : ''}</article>`;
  Lab.card({
    id: 'personal', requires: ['journal'],
    mount(el) {
      el._personal = {destroyed: false};
      el.classList.add('trading-body');
      el.innerHTML = `<div class="row trade-nav"><b>Find a trade route</b>${external('https://inara.cz/elite/market-traderoutes-search/', 'Open Inara')}</div>
        <form data-personal-search class="trade-form trading-form">
          <label>Route type<select name="route_type"><option value="round_trip">Round trip (return to start)</option><option value="one_way">One way</option></select></label>
          <label>Starting system<input name="origin" maxlength="160" placeholder="Current system"></label>
          <label>Starting station (optional)<input name="station" maxlength="160" placeholder="Any eligible station in system"></label>
          <label>Destination system (optional)<input name="destination" maxlength="160" placeholder="Any system within range"></label>
          <label>Load per leg (t)<input name="quantity" type="number" min="1" max="1000000" placeholder="Current ship capacity"></label>
          <label>Distance limit<select name="distance_mode"><option value="ly">Light-years per leg</option><option value="jumps">Estimated laden jumps per leg</option></select></label>
          <label data-ly>Maximum distance per leg (Ly)<input name="distance" type="number" min="0.1" max="500" step="0.1" value="80" required></label>
          <label data-jumps hidden>Maximum estimated jumps per leg<input name="jumps" type="number" min="1" max="20" value="2" required disabled></label>
          <label>Minimum landing pad<select name="pad"><option>L</option><option>M</option><option>S</option></select></label>
          <label>Maximum report age<select name="hours"><option value="3">3 hours</option><option value="6">6 hours</option><option value="12">12 hours</option><option value="24" selected>24 hours</option><option value="72">72 hours</option></select></label>
          <label>Maximum station approach<select name="arrival"><option value="2000">2,000 Ls</option><option value="10000" selected>10,000 Ls</option><option value="50000">50,000 Ls</option><option value="0">Any distance</option></select></label>
          <label>Fleet carriers<select name="carriers"><option value="0">Exclude</option><option value="1">Include (check docking access)</option></select></label><label>Credit affordability<select name="affordable"><option value="0">Show all (warn if over budget)</option><option value="1">Affordable routes only</option></select></label><label>Sort by<select name="sort"><option value="profit">Highest profit</option><option value="distance">Shortest distance</option><option value="freshness">Freshest reports</option><option value="credits">Lowest starting credits</option><option value="roi">Highest return on cost</option></select></label><label>Surface stations<select name="surface"><option value="0">Exclude</option><option value="1">Include</option></select></label>
          <label>Outbound commodity<select name="commodity"><option value="">All available goods</option></select></label>
          <label>Search breadth<select name="breadth"><option value="100">100 nearest eligible stations</option><option value="200">200 nearest eligible stations</option><option value="300">300 nearest eligible stations</option></select></label>
          <div class="trade-wide note" data-ship-context></div>
          <div class="trade-wide row"><button type="submit" class="mini primary">Find routes</button><span class="note">Carrier inclusion follows your filter. Round trips return to the same station; return cargo is chosen independently.</span></div>
        </form><p class="note trading-status" data-personal-status role="status">Choose your filters and find routes. Blank load uses your ship capacity.</p><div class="row"><button type="button" class="mini" data-cargo>Sell cargo aboard</button><label>Sales history <select data-history-days><option value="7">7 days</option><option value="30" selected>30 days</option><option value="90">90 days</option><option value="3650">Up to 10 years</option></select></label><button type="button" class="mini" data-history>Load completed sales</button></div><div data-extras role="status"></div><details><summary>Favorite routes</summary><div data-favorites></div></details><div data-monitor-status role="status"></div><button type="button" class="mini" data-stop-monitor hidden>Stop monitoring</button><div class="trade-pairs" data-personal-results></div>`;
      const form = el.querySelector('form'), status = el.querySelector('[data-personal-status]');
      const old = ls.get('personal.search.v1', {});
      const saved = ls.get(KEY, {...old, breadth: '100'});
      for (const [k, v] of Object.entries(saved)) {
        if (k !== 'commodity' && form.elements[k]) form.elements[k].value = v;
      }
      if (saved.commodity) {
        const option = document.createElement('option'); option.value = saved.commodity; option.textContent = saved.commodity;
        form.elements.commodity.append(option); form.elements.commodity.value = saved.commodity;
      }
      const mode = () => {
        const jumps = form.elements.distance_mode.value === 'jumps';
        el.querySelector('[data-ly]').hidden = jumps; el.querySelector('[data-jumps]').hidden = !jumps;
        form.elements.distance.disabled = jumps; form.elements.jumps.disabled = !jumps;
      };
      form.elements.distance_mode.onchange = mode; mode();
      const identity = r => JSON.stringify(r.legs.map(l => [l.buy.market_id, l.sell.market_id, l.commodity, l.quantity]));
      const favoriteKey = () => 'commodity.favorites.v1.' + (Lab.state.journal?.cmdr || 'unknown');
      const favorites = () => {const saved=ls.get(favoriteKey(),[]);return Array.isArray(saved)?saved:[]};
      const drawFavorites = () => {el.querySelector('[data-favorites]').innerHTML = favorites().map((f,i) => '<div class="row"><button type="button" class="mini" data-load-favorite="'+i+'">'+esc(f.label)+'</button><button type="button" class="mini" data-remove-favorite="'+i+'">Remove</button></div>').join('') || '<p class="note">Save a result to search it again with fresh prices.</p>';};
      drawFavorites();
      const stopMonitoring = () => {clearInterval(el._personal.timer); el._personal.timer=null; el._personal.monitor=null;el.querySelector('[data-stop-monitor]').hidden=true;};
      el.querySelector('[data-stop-monitor]').onclick = () => {stopMonitoring();el.querySelector('[data-monitor-status]').textContent='Monitoring stopped.';};
      el.onclick = async event => {
        const b=event.target.closest('button'); if(!b)return;
        if(b.dataset.favorite != null || b.dataset.monitor != null){
          const index=Number(b.dataset.favorite ?? b.dataset.monitor), result=el._personal.result, r=result?.rows[index];if(!r)return;
          const params={...el._personal.params, origin:r.legs[0].buy.system, station:r.legs[0].buy.station, destination:r.legs[0].sell.system};
          const label=r.legs.map(l=>l.commodity).join(' / ')+' | '+r.legs[0].buy.station+' - '+r.legs[0].sell.station;
          if(b.dataset.favorite != null){const all=favorites();if(!all.some(f=>f.id===identity(r)))all.push({id:identity(r),label,params});ls.set(favoriteKey(),all.slice(-50));drawFavorites();return;}
          stopMonitoring(); const monitor={id:identity(r),profit:r.profit,params,busy:false};el._personal.monitor=monitor;
          const status=el.querySelector('[data-monitor-status]');status.textContent='Monitoring '+label+'. Checks every five minutes while this dashboard is open.';el.querySelector('[data-stop-monitor]').hidden=false;
          el._personal.timer=setInterval(async()=>{if(monitor.busy||el._personal.destroyed)return;monitor.busy=true;try{const fresh=await Lab.api('/api/personal/routes',monitor.params);if(el._personal.monitor!==monitor)return;const match=fresh.rows.find(x=>identity(x)===monitor.id);const message=match ? 'Monitored route: '+price(match.profit)+' estimated profit ('+price(match.profit-monitor.profit)+' change).' : 'Monitored route is no longer in the checked results. Re-search before flying.';status.textContent=new Date().toLocaleTimeString()+' | '+message;if(!match||match.profit!==monitor.profit)Lab.toast(message);if(match)monitor.profit=match.profit;}catch(error){if(el._personal.monitor===monitor)status.textContent='Monitor refresh failed: '+error.message;}finally{monitor.busy=false;}},300000);
        }
        if(b.dataset.loadFavorite!=null){const f=favorites()[Number(b.dataset.loadFavorite)];if(!f)return;for(const [key,value] of Object.entries(f.params)){if(form.elements[key])form.elements[key].value=value;}mode();form.requestSubmit();}
        if(b.dataset.removeFavorite!=null){const all=favorites();all.splice(Number(b.dataset.removeFavorite),1);ls.set(favoriteKey(),all);drawFavorites();}
      };
      const extra=async(kind)=>{const request=el._personal.extraRequest=(el._personal.extraRequest||0)+1;const target=el.querySelector('[data-extras]');target.textContent='Loading...';try{const params=kind==='history'?{days:el.querySelector('[data-history-days]').value}:Object.fromEntries(new FormData(form));const data=await Lab.api('/api/personal/'+kind,params);if(el._personal.destroyed||el._personal.extraRequest!==request)return;target.innerHTML=(data.warnings||[]).map(w=>'<p class="warn">'+esc(w)+'</p>').join('')+'<p class="note">'+esc(data.note||'')+'</p>'+(kind==='history'?'<p>Recorded profit: <b>'+price(data.profit)+'</b> | '+fmt(data.unknown_cost_sales)+' sales with unknown cost</p>':'')+data.rows.map(r=>'<div class="trading-leg"><b>'+esc(r.commodity)+'</b> | '+fmt(r.quantity)+' t | '+esc(r.station||'Station unknown')+' / '+esc(r.system||'System unknown')+'<br>'+(kind==='history'?esc(new Date(r.timestamp).toLocaleString())+' | Profit: '+(r.profit==null?'Unknown cost':price(r.profit)):'SELL for '+price(r.revenue)+' revenue | Reported '+esc(new Date(r.observed_at).toLocaleString())+' '+external(Lab.util.inaraMarket(r.station,r.system),'Inara market'))+'</div>').join('')+(data.rows.length?'':'<p>No matching records.</p>');}catch(error){if(!el._personal.destroyed&&el._personal.extraRequest===request)target.textContent=error.message;}};
      el.querySelector('[data-cargo]').onclick=()=>extra('cargo');el.querySelector('[data-history]').onclick=()=>extra('history');
      form.onsubmit = async event => {
        event.preventDefault();
        const params = Object.fromEntries(new FormData(form));
        ls.set(KEY, params);
        const j = Lab.state.journal || {};
        params.origin = params.origin.trim() || j.system || '';
        params.quantity = params.quantity || j.cargo_capacity || '';
        const button = form.querySelector('[type=submit]'); button.disabled = true;
        status.textContent = 'Comparing Spansh station markets and checking each trade leg...';
        el.querySelector('[data-personal-results]').innerHTML = '';
        try {
          const result = await Lab.api('/api/personal/routes', params);
          if (el._personal.destroyed) return;
          el._personal.result = result;
          el._personal.params = {...params};
          const selected = form.elements.commodity.value;
          form.elements.commodity.innerHTML = '<option value="">All available goods</option>' + result.commodities.map(c => `<option value="${esc(c.key)}">${esc(c.name)}</option>`).join('');
          form.elements.commodity.value = selected;
          const s = result.settings;
          status.textContent = `${result.rows.length} routes | ${result.source} | ${s.origin}${s.destination ? ' to ' + s.destination : ''} | ${fmt(s.quantity)} t per leg | ${fmt(s.distance)} Ly limit | ${fmt(result.screened)} of ${fmt(result.available)} nearby stations checked | Searched ${new Date(result.queried_at).toLocaleString()}. ${result.note}`;
          el.querySelector('[data-personal-results]').innerHTML = result.warnings.map(w => `<p class="warn">${esc(w)}</p>`).join('') +
            (result.rows.length ? result.rows.map((r, i) => route(r, result, i)).join('') : '<p class="note">No routes found in the markets checked. Try a smaller load, older reports, more stations, a wider distance, or one-way trades. Round trips need a profitable full-load trade in both directions.</p>');
          Lab.relayout();
        } catch (error) {
          if (!el._personal.destroyed) status.textContent = error.message;
        } finally { if (!el._personal.destroyed) button.disabled = false; }
      };
    },
    render(el, S) {
      const j = S.journal || {}, form = el.querySelector('form');
      form.elements.origin.placeholder = j.system || 'Enter starting system';
      form.elements.quantity.placeholder = j.cargo_capacity ? `${fmt(j.cargo_capacity)} t` : 'Enter load size';
      el.querySelector('[data-ship-context]').textContent = `${j.ship_name || j.ship || 'Current ship'} | ${j.system || 'Location unknown'} | ${j.cargo_capacity == null ? 'Capacity unknown' : fmt(j.cargo_capacity) + ' t capacity'} | ${j.jump_range_laden == null ? 'Laden range unknown; use light-years' : fmt(j.jump_range_laden) + ' Ly fully laden'}. Jump limits are straight-line estimates, not plotted navigation. Results retain their search settings and prices until searched again.`;
    },
    unmount(el) { el._personal.destroyed = true; clearInterval(el._personal.timer); el._personal.monitor=null; },
  });
})();
