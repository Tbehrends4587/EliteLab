/* Nearby discovery shares the trading engine, filters and five-minute market cache. */
(() => {
  const {esc, fmt, ls} = Lab.util;
  const key = 'personal.nearby.v1';
  Lab.card({
    id: 'nearby-trades', requires: ['journal'],
    mount(el) {
      el._nearby = {destroyed: false};
      el.classList.add('trading-body');
      el.innerHTML = `<p class="note">Find profitable loops starting near you, even when your current system has little to trade. Ranked by total round-trip profit.</p>
        <form class="trade-form trading-form" data-nearby-search>
          <label>Near system<input name="origin" maxlength="160" placeholder="Current system"></label>
          <label>Maximum travel to start (Ly)<input name="radius" type="number" min="1" max="500" value="100" required></label>
          <label>Maximum trading leg (Ly)<input name="distance" type="number" min="1" max="500" value="80" required></label>
          <label>Load per leg (t)<input name="quantity" type="number" min="1" max="1000000" placeholder="Current ship capacity"></label>
          <label>Routes to show<select name="limit"><option>1</option><option>3</option><option selected>5</option><option>10</option><option>20</option><option>30</option></select></label>
          <label>Markets to check<select name="breadth"><option value="100">100 nearest eligible stations</option><option value="200">200 nearest eligible stations</option><option value="300" selected>300 nearest eligible stations</option></select></label>
          <label>Minimum landing pad<select name="pad"><option>L</option><option>M</option><option>S</option></select></label>
          <label>Maximum report age<select name="hours"><option value="3">3 hours</option><option value="6">6 hours</option><option value="12">12 hours</option><option value="24" selected>24 hours</option><option value="72">72 hours</option></select></label>
          <label>Maximum station approach<select name="arrival"><option value="2000">2,000 Ls</option><option value="10000" selected>10,000 Ls</option><option value="50000">50,000 Ls</option><option value="0">Any distance</option></select></label>
          <label>Fleet carriers<select name="carriers"><option value="0">Exclude</option><option value="1">Include (check docking access)</option></select></label>
          <label>Surface stations<select name="surface"><option value="0">Exclude</option><option value="1">Include</option></select></label>
          <label>Credit affordability<select name="affordable"><option value="0">Show all (warn if over budget)</option><option value="1">Affordable routes only</option></select></label>
          <div class="trade-wide"><button class="mini primary" type="submit">Find nearby routes</button></div>
        </form><p class="note" data-nearby-status role="status">Five results by default. The result limit does not reduce the number of markets checked.</p><div data-nearby-results></div>`;
      const form = el.querySelector('form'), status = el.querySelector('[data-nearby-status]');
      for (const [name, value] of Object.entries(ls.get(key, {}))) if (form.elements[name]) form.elements[name].value = value;
      form.onsubmit = async event => {
        event.preventDefault();
        const params = Object.fromEntries(new FormData(form));
        ls.set(key, params);
        params.origin = params.origin.trim() || Lab.state.journal?.system || '';
        params.quantity = params.quantity || Lab.state.journal?.cargo_capacity || '';
        Object.assign(params, {scope: 'nearby', route_type: 'round_trip', sort: 'profit'});
        const button = form.querySelector('[type=submit]'); button.disabled = true;
        status.textContent = 'Comparing nearby station pairs...';
        el.querySelector('[data-nearby-results]').innerHTML = '';
        try {
          const result = await Lab.api('/api/personal/routes', params);
          if (el._nearby.destroyed) return;
          el._nearby.result = result; el._nearby.params = params;
          status.textContent = `Best ${result.rows.length} of ${fmt(result.matched)} distinct loops found near ${result.settings.origin}. Checked ${fmt(result.screened)} of ${fmt(result.available)} reported stations. ${result.note}`;
          el.querySelector('[data-nearby-results]').innerHTML = result.warnings.map(w => `<p class="warn">${esc(w)}</p>`).join('') + result.rows.map((r, i) => {
            const [out, back] = r.legs;
            return `<article class="trade-pair trading-route">
              <div class="trading-summary"><h3>${i + 1}. ${esc(out.buy.station)} / ${esc(out.buy.system)} to ${esc(out.sell.station)} / ${esc(out.sell.system)} and back</h3><strong class="ok">${fmt(r.profit)} Cr / round trip</strong></div>
              <div class="trading-metrics"><span>${fmt(r.start_distance)} Ly to start</span><span>${fmt(r.distance)} Ly per trading leg</span><span>${fmt(r.quantity)} t per leg</span><span>${fmt(r.required_credits)} Cr needed</span><span>Oldest report: ${Number(r.age_hours).toFixed(1)} h</span></div>
              <p><b class="trading-leg-title">Outbound: ${esc(out.commodity)}</b><br>Buy at ${esc(out.buy.station)} for ${fmt(out.buy.price)} Cr/t; sell at ${esc(out.sell.station)} for ${fmt(out.sell.price)} Cr/t.</p>
              <p><b class="trading-leg-title">Return: ${esc(back.commodity)}</b><br>Buy at ${esc(back.buy.station)} for ${fmt(back.buy.price)} Cr/t; sell at ${esc(back.sell.station)} for ${fmt(back.sell.price)} Cr/t.</p>
              <p class="note">Approaches: ${out.buy.arrival_ls == null ? 'unknown' : fmt(out.buy.arrival_ls) + ' Ls'} / ${out.sell.arrival_ls == null ? 'unknown' : fmt(out.sell.arrival_ls) + ' Ls'}. ${out.buy.carrier || out.sell.carrier ? 'Includes a fleet carrier; verify docking access.' : ''}</p>
              ${result.credits != null && r.required_credits > result.credits ? '<p class="warn">Starting credits exceed your reported balance.</p>' : ''}
              ${result.ship_capacity != null && r.quantity > result.ship_capacity ? '<p class="warn">Load exceeds your reported ship capacity.</p>' : ''}
              <button type="button" class="mini primary" data-use-nearby="${i}">Use route in General Commodity Trading</button> <button type="button" class="mini" data-copy="${esc(out.buy.system)}">Copy starting system</button>
            </article>`;
          }).join('') + (result.rows.length ? '' : '<p class="note">No qualifying loops found. Try increasing travel distance or market coverage, or reducing the load.</p>');
          Lab.relayout();
        } catch (error) { if (!el._nearby.destroyed) status.textContent = error.message; }
        finally { if (!el._nearby.destroyed) button.disabled = false; }
      };
      el.onclick = event => {
        const button = event.target.closest('[data-use-nearby]');
        if (!button) return;
        const route = el._nearby.result?.rows[Number(button.dataset.useNearby)];
        if (!route) return;
        const leg = route.legs[0];
        Lab.set('personal', {selection: {...el._nearby.params, scope: 'local', origin: leg.buy.system, station: leg.buy.station,
          destination: leg.sell.system, destination_station: leg.sell.station, distance_mode: 'ly', commodity: leg.commodity.toLowerCase().replace(/[^a-z0-9]/g, ''), limit: '30'}});
        const card = document.getElementById('card-personal');
        if (card) { card.classList.remove('collapsed'); card.scrollIntoView({behavior: 'smooth', block: 'start'}); }
        else Lab.toast('Route selected. Show General Commodity Trading from the layout menu to load it.');
      };
    },
    render(el, S) {
      const form = el.querySelector('form');
      form.elements.origin.placeholder = S.journal?.system || 'Current system';
      form.elements.quantity.placeholder = S.journal?.cargo_capacity ? `${fmt(S.journal.cargo_capacity)} t` : 'Enter load size';
    },
    unmount(el) { el._nearby.destroyed = true; },
  });
})();
