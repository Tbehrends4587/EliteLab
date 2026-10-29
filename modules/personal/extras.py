"""Read-only commodity sale history and cargo-aware destinations."""
import json
import os
import threading
import math
from datetime import datetime, timezone
from elitelab.core.watcher import journal_files
from modules.personal.module import Personal, numeric, system_name, commodity_key, positive


class TradingExtras:
    def __init__(self, core):
        self.core = core
        self.cache = None
        self.lock = threading.Lock()

    def history(self, q):
        days = numeric(q, 'days', 30, 3650, True)
        commander = self.core.store.get('journal').get('cmdr')
        if not commander:
            return {'rows': [], 'profit': 0, 'unknown_cost_sales': 0, 'note': 'Waiting for commander identity.'}
        files = journal_files()
        signatures = []
        for f in files:
            try:
                stat = os.stat(f)
                signatures.append((f,stat.st_mtime_ns,stat.st_size))
            except OSError:
                pass
        cache_key = (commander,days,tuple(signatures),int(datetime.now(timezone.utc).timestamp()//300))
        with self.lock:
            if self.cache and self.cache[0] == cache_key:
                return self.cache[1]
            cutoff = datetime.now(timezone.utc).timestamp()-days*86400
            rows = []
            for f,_,_ in signatures:
                current, system, station = None, None, None
                try:
                    with open(f, encoding='utf-8', errors='replace') as stream:
                        for line in stream:
                            try:
                                e=json.loads(line)
                                event=e.get('event')
                                if event in ('Commander','LoadGame'):
                                    current=e.get('Name') or e.get('Commander') or current
                                if event in ('Location','FSDJump','CarrierJump'):
                                    system=e.get('StarSystem',system)
                                if event in ('Location','Docked'):
                                    station=e.get('StationName')
                                if event != 'MarketSell' or current != commander:
                                    continue
                                stamp=datetime.fromisoformat(e['timestamp'].replace('Z','+00:00')).timestamp()
                                if stamp < cutoff:
                                    continue
                                count,revenue,average=e.get('Count'),e.get('TotalSale'),e.get('AvgPrice')
                                if not positive(count) or type(revenue) not in (int,float) or not math.isfinite(revenue) or revenue < 0:
                                    continue
                                known=type(average) in (int,float) and math.isfinite(average) and average >= 0
                                rows.append({'timestamp':e['timestamp'],'commodity':e.get('Type_Localised') or e.get('Type'),
                                             'quantity':count,'revenue':revenue,'profit':revenue-count*average if known else None,
                                             'station':station,'system':system})
                            except (ValueError,TypeError,KeyError,AttributeError):
                                continue
                except OSError:
                    continue
            rows.sort(key=lambda r:r['timestamp'],reverse=True)
            result={'rows':rows[:200], 'sales':len(rows),'profit':sum(r['profit'] for r in rows if r['profit'] is not None),
                    'unknown_cost_sales':sum(r['profit'] is None for r in rows),
                    'note':'Completed MarketSell events for this commander. Profit uses journal AvgPrice; missing cost is unknown, never zero. Excludes fuel, fees and bonuses. Latest 200 sales shown; totals cover the selected period.'}
            self.cache=(cache_key,result)
            return result

    def cargo(self,q):
        if self.core.config.OFFLINE:
            raise ValueError('Spansh markets unavailable in offline mode.')
        j=self.core.store.get('journal')
        origin=system_name(q.get('origin') or j.get('system') or '')
        if not origin:
            raise ValueError('Starting system unknown.')
        distance=numeric(q,'distance',80,500)
        if q.get('distance_mode') == 'jumps':
            if not positive(j.get('jump_range_laden')):
                raise ValueError('Laden range unknown.')
            distance=numeric(q,'jumps',2,20,True)*j['jump_range_laden']
            if distance>500:
                raise ValueError('Maximum radius is 500 Ly.')
        pad=q.get('pad','L')
        if pad not in ('S','M','L') or str(q.get('carriers','0')) not in ('0','1') or str(q.get('surface','0')) not in ('0','1'):
            raise ValueError('Invalid market filters.')
        s={'hours':numeric(q,'hours',24,72,True),'quantity':1,'pad':pad,'carriers':str(q.get('carriers','0'))=='1',
           'surface':str(q.get('surface','0'))=='1','arrival':0 if q.get('arrival') in (0,'0') else numeric(q,'arrival',10000,1000000,True)}
        items=(j.get('cargo') or {}).get('items') or []
        owned={}
        for item in items:
            if not isinstance(item,dict):
                continue
            count=item.get('count')
            if not positive(count) or item.get('mission_id') or item.get('mission'):
                continue
            stolen=item.get('stolen') or 0
            if type(stolen) not in (int,float) or not math.isfinite(stolen) or stolen<0:
                continue
            quantity=max(0,count-stolen)
            if quantity:
                keys={commodity_key(name) for name in (item.get('name'), item.get('key')) if isinstance(name,str)}
                for key in keys:
                    owned[key]=owned.get(key,0)+quantity
        if not owned:
            return {'rows':[],'warnings':['No eligible non-stolen cargo in the current journal snapshot.']}
        desk=Personal(self.core)
        now=datetime.now(timezone.utc).timestamp()
        reports,_,warnings=desk.stations(s,origin,distance,numeric(q,'breadth',100,300,True),now)
        rows=[]
        for r in reports:
            if not isinstance(r,dict) or type(r.get('distance')) not in (int,float) or not 0<=r['distance']<=distance:
                continue
            m=desk.market(r,s,now)
            if not m:
                continue
            for name,quote in m['sells'].items():
                qty=owned.get(commodity_key(name),0)
                if qty:
                    sell_qty=min(qty,quote['volume'])
                    rows.append({'commodity':name,'quantity':sell_qty,'held':qty,'price':quote['price'],'revenue':sell_qty*quote['price'],
                                 'station':m['station'],'system':m['system'],'observed_at':m['observed_at']})
        rows.sort(key=lambda r:-r['revenue'])
        return {'rows':rows[:30],'warnings':warnings,'note':'Sale revenue, not profit: acquisition cost is not known here. Positive demand caps sale quantity; stolen/mission cargo excluded. Cargo snapshot: '+str((j.get('cargo') or {}).get('timestamp') or 'time unknown')}


def setup_extras(core,module):
    extras=TradingExtras(core)
    core.http.route('/api/personal/history',extras.history,tool='get_commodity_sale_history',module=module.name,
                    description='Actual completed commodity sales from this commander journal. Profit is revenue minus journal AvgPrice times quantity; missing cost stays unknown. Latest 200 sales, totals over selected period.',
                    params={'days':{'type':'integer','default':30}})
    core.http.route('/api/personal/cargo',extras.cargo,tool='find_cargo_sell_markets',module=module.name,
                    description='Find Spansh buyers for current non-stolen, non-mission cargo. Returns sale revenue, not estimated profit. Accepts trading origin, distance, distance_mode, jumps, pad, hours, arrival, surface, carriers, breadth filters.',
                    params={'origin':{'type':'string'},'distance':{'type':'number','default':80},
                            'distance_mode':{'type':'string','enum':['ly','jumps'],'default':'ly'},
                            'jumps':{'type':'integer','default':2},'pad':{'type':'string','enum':['S','M','L'],'default':'L'},
                            'hours':{'type':'integer','default':24},'arrival':{'type':'integer','default':10000},
                            'surface':{'type':'string','enum':['0','1'],'default':'0'},
                            'breadth':{'type':'integer','default':100},'carriers':{'type':'string','enum':['0','1'],'default':'0'}})
